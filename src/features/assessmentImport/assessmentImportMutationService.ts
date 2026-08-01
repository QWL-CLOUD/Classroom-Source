import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  importRunSchema,
  libraryCatalogItemSchema,
  type ChangeLog,
  type ImportRunSourceKind,
  type LibraryCatalogItem,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';
import { applyImportOperations } from '@/features/importCenter/applyImportOperations';
import {
  createImportCommand,
  deleteImportedLibraryItemOperation,
  deleteImportRunOperation,
  putImportedLibraryItemOperation,
  putImportRunOperation,
  serializeImportCommand,
  type ImportOperation,
} from '@/features/importCenter/importCommands';

import type { AssessmentImportPreview } from './assessmentImportModel';

export const MAX_ASSESSMENT_IMPORT_COMMAND_BYTES = 20 * 1024 * 1024;

export interface CommitAssessmentImportOptions {
  sourceKind: Extract<ImportRunSourceKind, 'csv' | 'xlsx' | 'json' | 'paste-table'>;
  sourceLabel?: string;
  worksheetName?: string;
  confirmUpdates: boolean;
  confirmCommit: boolean;
}

export interface AssessmentImportMutationDependencies {
  createId?: () => string;
  applyOperations?: typeof applyImportOperations;
}

export interface AssessmentImportCommitResult {
  created: LibraryCatalogItem[];
  updated: LibraryCatalogItem[];
  skippedCount: number;
  log: ChangeLog;
}

function sameRecord(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function commandSize(forwardJson: string, inverseJson: string): number {
  return (
    new TextEncoder().encode(forwardJson).byteLength +
    new TextEncoder().encode(inverseJson).byteLength
  );
}

export class AssessmentImportMutationService {
  private readonly createId: () => string;
  private readonly applyOperations: typeof applyImportOperations;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: AssessmentImportMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.applyOperations = dependencies.applyOperations ?? applyImportOperations;
  }

  async commit(
    preview: AssessmentImportPreview,
    options: CommitAssessmentImportOptions,
  ): Promise<AssessmentImportCommitResult> {
    if (!preview.canCommit) {
      throw new Error('Resolve every Review and Blocked Assessment row before committing.');
    }
    if (!options.confirmCommit) {
      throw new Error('Confirm that the complete reviewed Assessment preview should be committed.');
    }
    if (preview.summary.updateCount > 0 && !options.confirmUpdates) {
      throw new Error('Confirm the reviewed Assessment updates before committing.');
    }

    const result = await this.db.transaction(
      'rw',
      [this.db.libraryItems, this.db.importRuns, this.db.changeLog],
      async (): Promise<AssessmentImportCommitResult> => {
        if (await this.db.importRuns.get(preview.importRunId)) {
          throw new Error('This reviewed Assessment import has already been committed.');
        }

        const currentAssessments = (
          await this.db.libraryItems.where('catalogType').equals('assessment').toArray()
        ).map((value) => libraryCatalogItemSchema.parse(value));
        const currentByIdentity = new Map<string, LibraryCatalogItem>();
        for (const item of currentAssessments) {
          if (item.importIdentityKey) currentByIdentity.set(item.importIdentityKey, item);
        }

        const forwardItems: ImportOperation[] = [];
        const inverseItems: ImportOperation[] = [];
        const created: LibraryCatalogItem[] = [];
        const updated: LibraryCatalogItem[] = [];

        for (const row of preview.rows) {
          const plan = row.planned;
          if (row.classification === 'skip') {
            if (plan?.existingItem) {
              await this.validateExpectedItem(plan.existingItem, row.sourceRow);
            }
            continue;
          }
          if (row.classification !== 'create' && row.classification !== 'update') {
            throw new Error(`Row ${row.sourceRow} is not eligible for Assessment import.`);
          }
          if (!plan?.item) {
            throw new Error(`Row ${row.sourceRow} has no reviewed Assessment record.`);
          }

          const planned = libraryCatalogItemSchema.parse(plan.item);
          const identity = planned.importIdentityKey;

          if (row.classification === 'create') {
            if (await this.db.libraryItems.get(planned.id)) {
              throw new Error(`Row ${row.sourceRow} record ID changed after preview.`);
            }
            if (identity && currentByIdentity.has(identity)) {
              throw new Error(`Row ${row.sourceRow} Assessment identity changed after preview.`);
            }
            created.push(planned);
            forwardItems.push(putImportedLibraryItemOperation(planned));
            inverseItems.unshift(deleteImportedLibraryItemOperation(planned.id));
          } else {
            const expected = plan.existingItem;
            if (!expected) {
              throw new Error(`Row ${row.sourceRow} has no expected Assessment snapshot.`);
            }
            await this.validateExpectedItem(expected, row.sourceRow);
            const owner = identity ? currentByIdentity.get(identity) : undefined;
            if (owner && owner.id !== expected.id) {
              throw new Error(
                `Row ${row.sourceRow} Assessment identity now belongs to another record.`,
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
        }

        const importRun = importRunSchema.parse({
          id: preview.importRunId,
          importType: 'assessments',
          sourceKind: options.sourceKind,
          sourceLabel: options.sourceLabel?.trim() || undefined,
          worksheetName: options.worksheetName?.trim() || undefined,
          totalRows: preview.summary.total,
          createdCount: preview.summary.createCount,
          updatedCount: preview.summary.updateCount,
          skippedCount: preview.summary.skipCount,
          reviewCount: 0,
          blockedCount: 0,
          summaryJson: JSON.stringify({
            sourceFingerprint: preview.sourceFingerprint,
          }),
          committedAt: preview.generatedAt,
        });

        const forward = createImportCommand([...forwardItems, putImportRunOperation(importRun)]);
        const inverse = createImportCommand([
          ...inverseItems,
          deleteImportRunOperation(importRun.id),
        ]);
        const forwardJson = serializeImportCommand(forward);
        const inverseJson = serializeImportCommand(inverse);
        if (commandSize(forwardJson, inverseJson) > MAX_ASSESSMENT_IMPORT_COMMAND_BYTES) {
          throw new Error(
            'This reviewed Assessment import is too large for safe Undo/Redo. Split the source into smaller imports.',
          );
        }

        const log = changeLogSchema.parse({
          id: this.createId(),
          label: `Import ${created.length + updated.length} reviewed Assessments`,
          commandType: 'import-center.assessments.reviewed',
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
    const currentValue = await this.db.libraryItems.get(expected.id);
    if (!currentValue) {
      throw new Error(`Row ${sourceRow} Assessment changed after preview. Generate a new preview.`);
    }
    const current = libraryCatalogItemSchema.parse(currentValue);
    if (!sameRecord(current, expected)) {
      throw new Error(`Row ${sourceRow} Assessment changed after preview. Generate a new preview.`);
    }
  }
}

export const assessmentImportMutationService = new AssessmentImportMutationService();
