import { z } from 'zod';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  libraryCatalogItemSchema,
  libraryCatalogTypedFieldsSchema,
  type ChangeLog,
  type LibraryCatalogItem,
  type LibraryCatalogStatus,
} from '@/domain/models/entities';
import {
  buildCategoryAssignmentChangePlan,
  type CategorySelectionMap,
} from '@/features/categories/categoryAssignmentSelection';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import {
  createLibraryCatalogCommand,
  deleteLibraryCatalogItemOperation,
  putLibraryCatalogItemOperation,
  serializeLibraryCatalogCommand,
  type LibraryCatalogCommandPair,
  type LibraryCatalogOperation,
} from './libraryCatalogCommands';
import { normalizeLibraryCatalogTags } from './libraryCatalogReadModel';
import { typedFieldsForCatalogType } from './libraryCatalogTypedFields';

const optionalTrimmedString = (maximum: number) =>
  z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed || undefined;
  }, z.string().max(maximum).optional());

export const libraryCatalogCreateValuesSchema = z
  .object({
    catalogType: z.enum(['activity', 'resource', 'assessment', 'standard']),
    title: z.string().trim().min(1, 'Enter a Library item title.').max(240),
    description: optionalTrimmedString(5000),
    tags: z.array(z.string().max(80)).max(30).default([]),
    typedFields: libraryCatalogTypedFieldsSchema.optional(),
  })
  .superRefine((values, context) => {
    if (values.catalogType === 'standard' && values.typedFields) {
      context.addIssue({
        code: 'custom',
        path: ['typedFields'],
        message: 'Standards do not use Phase 3E-3 typed workflow fields.',
      });
    }
    if (
      values.catalogType !== 'standard' &&
      values.typedFields &&
      values.typedFields.catalogType !== values.catalogType
    ) {
      context.addIssue({
        code: 'custom',
        path: ['typedFields'],
        message: 'Typed workflow fields must match the Catalog type.',
      });
    }
  });

export const libraryCatalogUpdateValuesSchema = z.object({
  title: z.string().trim().min(1, 'Enter a Library item title.').max(240),
  description: optionalTrimmedString(5000),
  tags: z.array(z.string().max(80)).max(30).default([]),
  typedFields: libraryCatalogTypedFieldsSchema.optional(),
});

export type LibraryCatalogCreateValues = z.input<typeof libraryCatalogCreateValuesSchema>;
export type LibraryCatalogUpdateValues = z.input<typeof libraryCatalogUpdateValuesSchema>;

export interface LibraryCatalogMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

function categorySelectionsForType(
  catalogType: LibraryCatalogItem['catalogType'],
  selections: CategorySelectionMap | undefined,
): CategorySelectionMap {
  if (catalogType === 'resource') return selections ?? {};
  return { 'resource-format': [] };
}

export class LibraryCatalogMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: LibraryCatalogMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(
    values: LibraryCatalogCreateValues,
    categorySelections?: CategorySelectionMap,
  ): Promise<LibraryCatalogItem> {
    const parsed = libraryCatalogCreateValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      [
        this.db.libraryItems,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.changeLog,
      ],
      async (): Promise<CommitResult<LibraryCatalogItem>> => {
        const now = this.now();
        const item = libraryCatalogItemSchema.parse({
          id: this.createId(),
          catalogType: parsed.catalogType,
          title: parsed.title,
          description: parsed.description,
          tags: normalizeLibraryCatalogTags(parsed.tags),
          typedFields: typedFieldsForCatalogType(parsed.catalogType, parsed.typedFields),
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        const categoryPlan = await buildCategoryAssignmentChangePlan(
          this.db,
          'library-item',
          item.id,
          {
            selections: categorySelectionsForType(item.catalogType, categorySelections),
            useDefaultsForMissingFamilies: item.catalogType === 'resource',
            createId: this.createId,
            now,
          },
        );
        const commands: LibraryCatalogCommandPair = {
          forward: createLibraryCatalogCommand([
            putLibraryCatalogItemOperation(item),
            ...categoryPlan.forward,
          ]),
          inverse: createLibraryCatalogCommand([
            ...categoryPlan.inverse,
            deleteLibraryCatalogItemOperation(item.id),
          ]),
        };
        const log = this.createChangeLog(
          'library-catalog.create',
          `Create Library item “${item.title}”`,
          commands,
          now,
        );
        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: item, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async update(
    id: string,
    values: LibraryCatalogUpdateValues,
    categorySelections?: CategorySelectionMap,
  ): Promise<LibraryCatalogItem> {
    const parsed = libraryCatalogUpdateValuesSchema.parse(values);
    return this.replace(
      id,
      'library-catalog.update',
      'Edit Library item',
      (existing, now) => ({
        ...existing,
        title: parsed.title,
        description: parsed.description,
        tags: normalizeLibraryCatalogTags(parsed.tags),
        typedFields: typedFieldsForCatalogType(
          existing.catalogType,
          parsed.typedFields ?? existing.typedFields,
        ),
        updatedAt: now,
      }),
      categorySelections,
    );
  }

  async archive(id: string): Promise<LibraryCatalogItem> {
    return this.setStatus(id, 'archived');
  }

  async restore(id: string): Promise<LibraryCatalogItem> {
    return this.setStatus(id, 'active');
  }

  private async setStatus(id: string, status: LibraryCatalogStatus): Promise<LibraryCatalogItem> {
    const existing = await this.requireItem(id);
    if (existing.status === status) {
      throw new Error(`This Library item is already ${status}.`);
    }
    return this.replace(
      id,
      `library-catalog.${status === 'active' ? 'restore' : 'archive'}`,
      status === 'active' ? 'Restore Library item' : 'Archive Library item',
      (current, now) => ({
        ...current,
        status,
        archivedAt: status === 'archived' ? now : undefined,
        updatedAt: now,
      }),
    );
  }

  private async replace(
    id: string,
    commandType: string,
    label: string,
    update: (existing: LibraryCatalogItem, now: string) => LibraryCatalogItem,
    categorySelections?: CategorySelectionMap,
  ): Promise<LibraryCatalogItem> {
    const result = await this.db.transaction(
      'rw',
      [
        this.db.libraryItems,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.changeLog,
      ],
      async (): Promise<CommitResult<LibraryCatalogItem>> => {
        const existing = await this.requireItem(id);
        const now = this.now();
        const updated = libraryCatalogItemSchema.parse(update(existing, now));
        const categoryPlan = await buildCategoryAssignmentChangePlan(
          this.db,
          'library-item',
          updated.id,
          {
            selections: categorySelectionsForType(updated.catalogType, categorySelections),
            useDefaultsForMissingFamilies: false,
            createId: this.createId,
            now,
          },
        );
        const commands: LibraryCatalogCommandPair = {
          forward: createLibraryCatalogCommand([
            putLibraryCatalogItemOperation(updated),
            ...categoryPlan.forward,
          ]),
          inverse: createLibraryCatalogCommand([
            ...categoryPlan.inverse,
            putLibraryCatalogItemOperation(existing),
          ]),
        };
        const log = this.createChangeLog(commandType, `${label} “${updated.title}”`, commands, now);
        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(commands.forward.operations);
        await this.db.changeLog.put(log);
        return { value: updated, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  private async requireItem(id: string): Promise<LibraryCatalogItem> {
    const item = await this.db.libraryItems.get(id);
    if (!item) throw new Error('Library item not found.');
    return libraryCatalogItemSchema.parse(item);
  }

  private async applyOperations(operations: readonly LibraryCatalogOperation[]): Promise<void> {
    for (const operation of operations) {
      if (operation.table === 'libraryItems') {
        if (operation.action === 'put') {
          await this.db.libraryItems.put(operation.record);
        } else {
          await this.db.libraryItems.delete(operation.id);
        }
      } else if (operation.action === 'put') {
        await this.db.categoryAssignments.put(operation.record);
      } else {
        await this.db.categoryAssignments.delete(operation.id);
      }
    }
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: LibraryCatalogCommandPair,
    createdAt: string,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeLibraryCatalogCommand(commands.forward),
      inverseJson: serializeLibraryCatalogCommand(commands.inverse),
      createdAt,
    });
  }

  private notifyNewChange(log: ChangeLog): void {
    notifyEditHistoryChanged({
      canUndo: true,
      canRedo: false,
      undoLabel: log.label,
    });
  }
}

export const libraryCatalogMutationService = new LibraryCatalogMutationService();
