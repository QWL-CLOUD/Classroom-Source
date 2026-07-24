import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  lessonTemplateSchema,
  libraryCatalogItemSchema,
  type ChangeLog,
  type LessonTemplate,
  type LessonTemplateStatus,
} from '@/domain/models/entities';
import {
  buildCategoryAssignmentChangePlan,
  type CategorySelectionMap,
} from '@/features/categories/categoryAssignmentSelection';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';
import { listLibraryApplicationLinks } from '@/features/libraryCatalog/libraryApplicationModel';

import {
  createLessonTemplateCommand,
  deleteLessonTemplateOperation,
  putLessonTemplateOperation,
  serializeLessonTemplateCommand,
  type LessonTemplateCommandPair,
  type LessonTemplateOperation,
} from './lessonTemplateCommands';
import {
  parseLessonTemplateEditorValues,
  type LessonTemplateEditorValues,
} from './lessonTemplateModel';

export interface LessonTemplateMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export class LessonTemplateMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: LessonTemplateMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(
    values: LessonTemplateEditorValues,
    categorySelections?: CategorySelectionMap,
  ): Promise<LessonTemplate> {
    const fields = parseLessonTemplateEditorValues(values);
    const result = await this.db.transaction(
      'rw',
      [
        this.db.lessonTemplates,
        this.db.libraryItems,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.changeLog,
      ],
      async (): Promise<CommitResult<LessonTemplate>> => {
        await this.validateLibraryLinks(fields);
        const now = this.now();
        const template = lessonTemplateSchema.parse({
          id: this.createId(),
          ...fields,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        if (await this.db.lessonTemplates.get(template.id)) {
          throw new Error('Lesson template ID already exists.');
        }
        const categoryPlan = await buildCategoryAssignmentChangePlan(
          this.db,
          'lesson-template',
          template.id,
          {
            selections: categorySelections,
            useDefaultsForMissingFamilies: true,
            createId: this.createId,
            now,
          },
        );
        const commands: LessonTemplateCommandPair = {
          forward: createLessonTemplateCommand([
            putLessonTemplateOperation(template),
            ...categoryPlan.forward,
          ]),
          inverse: createLessonTemplateCommand([
            ...categoryPlan.inverse,
            deleteLessonTemplateOperation(template.id),
          ]),
        };
        const log = this.createChangeLog(
          'lesson-template.create',
          `Create lesson template “${template.title}”`,
          commands,
          now,
        );
        await this.commit(commands.forward.operations, log);
        return { value: template, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async update(
    id: string,
    values: LessonTemplateEditorValues,
    categorySelections?: CategorySelectionMap,
  ): Promise<LessonTemplate> {
    const fields = parseLessonTemplateEditorValues(values);
    return this.replace(
      id,
      'lesson-template.update',
      'Edit lesson template',
      async (existing, now) => {
        await this.validateLibraryLinks(fields);
        return lessonTemplateSchema.parse({
          ...existing,
          ...fields,
          updatedAt: now,
        });
      },
      categorySelections,
    );
  }

  async archive(id: string): Promise<LessonTemplate> {
    return this.setStatus(id, 'archived');
  }

  async restore(id: string): Promise<LessonTemplate> {
    return this.setStatus(id, 'active');
  }

  private async setStatus(id: string, status: LessonTemplateStatus): Promise<LessonTemplate> {
    return this.replace(
      id,
      status === 'active' ? 'lesson-template.restore' : 'lesson-template.archive',
      status === 'active' ? 'Restore lesson template' : 'Archive lesson template',
      async (existing, now) => {
        if (existing.status === status) {
          throw new Error(`This lesson template is already ${status}.`);
        }
        return lessonTemplateSchema.parse({
          ...existing,
          status,
          archivedAt: status === 'archived' ? now : undefined,
          updatedAt: now,
        });
      },
    );
  }

  private async replace(
    id: string,
    commandType: string,
    label: string,
    update: (existing: LessonTemplate, now: string) => Promise<LessonTemplate>,
    categorySelections?: CategorySelectionMap,
  ): Promise<LessonTemplate> {
    const result = await this.db.transaction(
      'rw',
      [
        this.db.lessonTemplates,
        this.db.libraryItems,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.changeLog,
      ],
      async (): Promise<CommitResult<LessonTemplate>> => {
        const existing = await this.requireTemplate(id);
        const now = this.now();
        const updated = await update(existing, now);
        const categoryPlan = await buildCategoryAssignmentChangePlan(
          this.db,
          'lesson-template',
          updated.id,
          {
            selections: categorySelections,
            useDefaultsForMissingFamilies: false,
            createId: this.createId,
            now,
          },
        );
        const commands: LessonTemplateCommandPair = {
          forward: createLessonTemplateCommand([
            putLessonTemplateOperation(updated),
            ...categoryPlan.forward,
          ]),
          inverse: createLessonTemplateCommand([
            ...categoryPlan.inverse,
            putLessonTemplateOperation(existing),
          ]),
        };
        const log = this.createChangeLog(commandType, `${label} “${updated.title}”`, commands, now);
        await this.commit(commands.forward.operations, log);
        return { value: updated, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  private async requireTemplate(id: string): Promise<LessonTemplate> {
    const value = await this.db.lessonTemplates.get(id);
    if (!value) throw new Error('Lesson template not found.');
    return lessonTemplateSchema.parse(value);
  }

  private async validateLibraryLinks(
    content: Parameters<typeof listLibraryApplicationLinks>[0],
  ): Promise<void> {
    const links = listLibraryApplicationLinks(content);
    const checked = new Set<string>();
    for (const link of links) {
      if (checked.has(link.libraryItemId)) continue;
      checked.add(link.libraryItemId);
      const value = await this.db.libraryItems.get(link.libraryItemId);
      if (!value) {
        throw new Error('A linked Library item no longer exists. Remove it before saving.');
      }
      const item = libraryCatalogItemSchema.parse(value);
      if (item.catalogType === 'standard') {
        throw new Error('Standards cannot be linked before Phase 3F.');
      }
      if (item.catalogType !== link.catalogType) {
        throw new Error('A linked Library item no longer matches its saved Catalog type.');
      }
    }
  }

  private async commit(
    operations: readonly LessonTemplateOperation[],
    log: ChangeLog,
  ): Promise<void> {
    await clearSupportedRedoBranch(this.db);
    await this.applyOperations(operations);
    await this.db.changeLog.put(log);
  }

  private async applyOperations(operations: readonly LessonTemplateOperation[]): Promise<void> {
    for (const operation of operations) {
      if (operation.table === 'lessonTemplates') {
        if (operation.action === 'put') {
          await this.db.lessonTemplates.put(operation.record);
        } else {
          await this.db.lessonTemplates.delete(operation.id);
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
    commands: LessonTemplateCommandPair,
    createdAt: string,
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeLessonTemplateCommand(commands.forward),
      inverseJson: serializeLessonTemplateCommand(commands.inverse),
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

export const lessonTemplateMutationService = new LessonTemplateMutationService();
