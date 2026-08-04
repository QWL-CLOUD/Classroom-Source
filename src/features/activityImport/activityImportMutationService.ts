import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  categoryAssignmentSchema,
  categoryValueSchema,
  changeLogSchema,
  importRunSchema,
  libraryCatalogItemSchema,
  type CategoryAssignment,
  type CategoryValue,
  type ClassificationMappingPreset,
  type ChangeLog,
  type ImportRunSourceKind,
  type LibraryCatalogItem,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';
import { applyImportOperations } from '@/features/importCenter/applyImportOperations';
import { classificationSummaryJson } from '@/features/importCenter/importClassificationResolution';
import {
  importClassificationMappingPresetOperations,
  validateImportClassificationMappingPresetState,
} from '@/features/importCenter/importClassificationMappingPresetPlan';
import {
  createImportCommand,
  deleteImportCategoryAssignmentOperation,
  deleteImportCategoryValueOperation,
  deleteImportedLibraryItemOperation,
  deleteImportRunOperation,
  putImportCategoryAssignmentOperation,
  putImportCategoryValueOperation,
  putImportedLibraryItemOperation,
  putImportRunOperation,
  serializeImportCommand,
  type ImportOperation,
} from '@/features/importCenter/importCommands';

import type { ActivityImportPreview } from './activityImportModel';

export const MAX_ACTIVITY_IMPORT_COMMAND_BYTES = 20 * 1024 * 1024;

export interface CommitActivityImportOptions {
  sourceKind: Extract<ImportRunSourceKind, 'csv' | 'xlsx' | 'json' | 'paste-table'>;
  sourceLabel?: string;
  worksheetName?: string;
  confirmUpdates: boolean;
  confirmCommit: boolean;
}

export interface ActivityImportMutationDependencies {
  createId?: () => string;
  applyOperations?: typeof applyImportOperations;
}

export interface ActivityImportCommitResult {
  created: LibraryCatalogItem[];
  updated: LibraryCatalogItem[];
  skippedCount: number;
  createdCategoryValues: CategoryValue[];
  restoredCategoryValues: CategoryValue[];
  createdMappingPresets: ClassificationMappingPreset[];
  updatedMappingPresets: ClassificationMappingPreset[];
  log: ChangeLog;
}

function sameRecord(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function sortedAssignments(values: readonly CategoryAssignment[]): CategoryAssignment[] {
  return [...values].sort((first, second) => first.id.localeCompare(second.id));
}

function commandSize(forwardJson: string, inverseJson: string): number {
  return (
    new TextEncoder().encode(forwardJson).byteLength +
    new TextEncoder().encode(inverseJson).byteLength
  );
}

export class ActivityImportMutationService {
  private readonly createId: () => string;
  private readonly applyOperations: typeof applyImportOperations;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: ActivityImportMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.applyOperations = dependencies.applyOperations ?? applyImportOperations;
  }

  async commit(
    preview: ActivityImportPreview,
    options: CommitActivityImportOptions,
  ): Promise<ActivityImportCommitResult> {
    if (!preview.canCommit) {
      throw new Error('Resolve every Review and Blocked Activity row before committing.');
    }
    if (!options.confirmCommit) {
      throw new Error('Confirm that the complete reviewed Activity preview should be committed.');
    }
    if (preview.summary.updateCount > 0 && !options.confirmUpdates) {
      throw new Error('Confirm the reviewed Activity updates before committing.');
    }

    const result = await this.db.transaction(
      'rw',
      [
        this.db.libraryItems,
        this.db.categoryValues,
        this.db.categoryAssignments,
        this.db.classificationMappingPresets,
        this.db.importRuns,
        this.db.changeLog,
      ],
      async (): Promise<ActivityImportCommitResult> => {
        if (await this.db.importRuns.get(preview.importRunId)) {
          throw new Error('This reviewed Activity import has already been committed.');
        }

        await this.validateCategoryState(preview);
        await this.validateMappingState(preview);

        const forwardItems: ImportOperation[] = [];
        const inverseItems: ImportOperation[] = [];
        const forwardAssignments: ImportOperation[] = [];
        const inverseAssignments: ImportOperation[] = [];
        const created: LibraryCatalogItem[] = [];
        const updated: LibraryCatalogItem[] = [];
        const currentByIdentity = new Map<string, LibraryCatalogItem>();
        const currentActivities = (
          await this.db.libraryItems.where('catalogType').equals('activity').toArray()
        ).map((value) => libraryCatalogItemSchema.parse(value));
        for (const item of currentActivities) {
          if (item.importIdentityKey) currentByIdentity.set(item.importIdentityKey, item);
        }

        for (const row of preview.rows) {
          const plan = row.planned;
          if (row.classification === 'skip') {
            if (plan?.existingItem) {
              await this.validateExpectedItem(plan.existingItem, row.sourceRow);
              await this.validateExpectedAssignments(
                plan.existingItem.id,
                plan.expectedAssignments,
                row.sourceRow,
              );
            }
            continue;
          }
          if (row.classification !== 'create' && row.classification !== 'update') {
            throw new Error(`Row ${row.sourceRow} is not eligible for Activity import.`);
          }
          if (!plan?.item) throw new Error(`Row ${row.sourceRow} has no reviewed Activity record.`);
          const planned = libraryCatalogItemSchema.parse(plan.item);
          const identity = planned.importIdentityKey;

          if (row.classification === 'create') {
            if (await this.db.libraryItems.get(planned.id)) {
              throw new Error(`Row ${row.sourceRow} record ID changed after preview.`);
            }
            if (identity && currentByIdentity.has(identity)) {
              throw new Error(`Row ${row.sourceRow} Activity identity changed after preview.`);
            }
            created.push(planned);
            forwardItems.push(putImportedLibraryItemOperation(planned));
            inverseItems.unshift(deleteImportedLibraryItemOperation(planned.id));
          } else {
            const expected = plan.existingItem;
            if (!expected)
              throw new Error(`Row ${row.sourceRow} has no expected Activity snapshot.`);
            await this.validateExpectedItem(expected, row.sourceRow);
            const identityOwner = identity ? currentByIdentity.get(identity) : undefined;
            if (identityOwner && identityOwner.id !== expected.id) {
              throw new Error(
                `Row ${row.sourceRow} Activity identity now belongs to another record.`,
              );
            }
            updated.push(planned);
            forwardItems.push(putImportedLibraryItemOperation(planned));
            inverseItems.unshift(putImportedLibraryItemOperation(expected));
            if (expected.importIdentityKey && expected.importIdentityKey !== identity) {
              currentByIdentity.delete(expected.importIdentityKey);
            }
          }
          if (identity) currentByIdentity.set(identity, planned);

          await this.validateExpectedAssignments(
            plan.existingItem?.id,
            plan.expectedAssignments,
            row.sourceRow,
          );
          for (const assignment of plan.assignmentsToDelete) {
            forwardAssignments.push(deleteImportCategoryAssignmentOperation(assignment.id));
            inverseAssignments.unshift(putImportCategoryAssignmentOperation(assignment));
          }
          for (const assignmentPlan of plan.assignmentsToCreate) {
            const assignment = categoryAssignmentSchema.parse(assignmentPlan.record);
            const existing = await this.db.categoryAssignments
              .where('[categoryValueId+entityType+entityId]')
              .equals([assignment.categoryValueId, assignment.entityType, assignment.entityId])
              .first();
            if (existing) {
              throw new Error(`Row ${row.sourceRow} category assignments changed after preview.`);
            }
            forwardAssignments.push(putImportCategoryAssignmentOperation(assignment));
            inverseAssignments.unshift(deleteImportCategoryAssignmentOperation(assignment.id));
          }
        }

        const forwardCategoryValues: ImportOperation[] = [];
        const inverseCategoryValues: ImportOperation[] = [];
        for (const value of preview.newCategoryValues) {
          forwardCategoryValues.push(putImportCategoryValueOperation(value));
          inverseCategoryValues.unshift(deleteImportCategoryValueOperation(value.id));
        }
        for (const change of preview.restoredCategoryValues) {
          forwardCategoryValues.push(putImportCategoryValueOperation(change.after));
          inverseCategoryValues.unshift(putImportCategoryValueOperation(change.before));
        }

        const mappingOperations = importClassificationMappingPresetOperations(preview);

        const importRun = importRunSchema.parse({
          id: preview.importRunId,
          importType: 'activities',
          sourceKind: options.sourceKind,
          sourceLabel: options.sourceLabel?.trim() || undefined,
          worksheetName: options.worksheetName?.trim() || undefined,
          totalRows: preview.summary.total,
          createdCount: preview.summary.createCount,
          updatedCount: preview.summary.updateCount,
          skippedCount: preview.summary.skipCount,
          reviewCount: 0,
          blockedCount: 0,
          summaryJson: classificationSummaryJson({
            sourceFingerprint: preview.sourceFingerprint,
            defaults: preview.defaults,
            newCategoryValues: preview.newCategoryValues,
            restoredCategoryValues: preview.restoredCategoryValues,
            classificationAudit: preview.classificationAudit,
            classificationMappingAudit: preview.classificationMappingAudit,
          }),
          committedAt: preview.generatedAt,
        });

        const forward = createImportCommand([
          ...forwardCategoryValues,
          ...mappingOperations.forward,
          ...forwardItems,
          ...forwardAssignments,
          putImportRunOperation(importRun),
        ]);
        const inverse = createImportCommand([
          ...inverseAssignments,
          ...inverseItems,
          ...mappingOperations.inverse,
          ...inverseCategoryValues,
          deleteImportRunOperation(importRun.id),
        ]);
        const forwardJson = serializeImportCommand(forward);
        const inverseJson = serializeImportCommand(inverse);
        if (commandSize(forwardJson, inverseJson) > MAX_ACTIVITY_IMPORT_COMMAND_BYTES) {
          throw new Error(
            'This reviewed Activity import is too large for safe Undo/Redo. Split the source into smaller imports.',
          );
        }
        const log = changeLogSchema.parse({
          id: this.createId(),
          label: `Import ${created.length + updated.length} reviewed Activities`,
          commandType: 'import-center.activities.reviewed',
          forwardJson,
          inverseJson,
          createdAt: preview.generatedAt,
        });

        await clearSupportedRedoBranch(this.db);
        await this.applyOperations(this.db, forward.operations);
        await this.db.changeLog.put(log);

        return {
          created,
          updated,
          skippedCount: preview.summary.skipCount,
          createdCategoryValues: preview.newCategoryValues,
          restoredCategoryValues: preview.restoredCategoryValues.map((value) => value.after),
          createdMappingPresets: preview.newMappingPresets,
          updatedMappingPresets: preview.updatedMappingPresets.map((value) => value.after),
          log,
        };
      },
    );

    notifyEditHistoryChanged({
      canUndo: true,
      canRedo: false,
      undoLabel: result.log.label,
    });
    return result;
  }

  private async validateExpectedItem(
    expected: LibraryCatalogItem,
    sourceRow: number,
  ): Promise<void> {
    const current = await this.db.libraryItems.get(expected.id);
    if (!current || !sameRecord(libraryCatalogItemSchema.parse(current), expected)) {
      throw new Error(`Row ${sourceRow} Activity changed after preview. Generate a new preview.`);
    }
  }

  private async validateExpectedAssignments(
    entityId: string | undefined,
    expected: readonly CategoryAssignment[],
    sourceRow: number,
  ): Promise<void> {
    if (!entityId) {
      if (expected.length > 0)
        throw new Error(`Row ${sourceRow} contains invalid expected category assignments.`);
      return;
    }
    const current = (
      await this.db.categoryAssignments
        .where('[entityType+entityId]')
        .equals(['library-item', entityId])
        .toArray()
    )
      .map((value) => categoryAssignmentSchema.parse(value))
      .filter((value) =>
        [
          'subject',
          'grade-level',
          'language',
          'language-level',
          'activity-type',
          'purpose-tag',
          'focus-tag',
        ].includes(value.familyId),
      );
    if (!sameRecord(sortedAssignments(current), sortedAssignments(expected))) {
      throw new Error(
        `Row ${sourceRow} category assignments changed after preview. Generate a new preview.`,
      );
    }
  }

  private async validateMappingState(preview: ActivityImportPreview): Promise<void> {
    const valuesAfterCommit = new Map(
      (await this.db.categoryValues.toArray())
        .map((value) => categoryValueSchema.parse(value))
        .map((value) => [value.id, value] as const),
    );
    for (const value of preview.newCategoryValues) valuesAfterCommit.set(value.id, value);
    for (const change of preview.restoredCategoryValues) {
      valuesAfterCommit.set(change.after.id, change.after);
    }
    await validateImportClassificationMappingPresetState({
      db: this.db,
      expectedMappingPresets: preview.expectedMappingPresets,
      newMappingPresets: preview.newMappingPresets,
      updatedMappingPresets: preview.updatedMappingPresets,
      categoryValuesAfterCommit: [...valuesAfterCommit.values()],
    });
  }

  private async validateCategoryState(preview: ActivityImportPreview): Promise<void> {
    for (const expected of preview.expectedCategoryValues) {
      const current = await this.db.categoryValues.get(expected.id);
      if (!current || !sameRecord(categoryValueSchema.parse(current), expected)) {
        throw new Error(
          `Category “${expected.name}” changed after preview. Generate a new preview.`,
        );
      }
    }
    for (const change of preview.restoredCategoryValues) {
      const current = await this.db.categoryValues.get(change.before.id);
      if (!current || !sameRecord(categoryValueSchema.parse(current), change.before)) {
        throw new Error(
          `Category “${change.before.name}” changed after preview. Generate a new preview.`,
        );
      }
    }
    const currentValues = (await this.db.categoryValues.toArray()).map((value) =>
      categoryValueSchema.parse(value),
    );
    for (const value of preview.newCategoryValues) {
      if (await this.db.categoryValues.get(value.id)) {
        throw new Error(`New category “${value.name}” changed after preview.`);
      }
      const collision = currentValues.find(
        (current) =>
          current.familyId === value.familyId &&
          (current.normalizedName === value.normalizedName ||
            current.normalizedAliases.includes(value.normalizedName)),
      );
      if (collision) {
        throw new Error(
          `Category “${value.name}” now conflicts with “${collision.name}”. Generate a new preview.`,
        );
      }
    }
  }
}

export const activityImportMutationService = new ActivityImportMutationService();
