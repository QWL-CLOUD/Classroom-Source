import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  changeLogSchema,
  importRunSchema,
  standardSchema,
  type ChangeLog,
  type Standard,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';
import { applyImportOperations } from '@/features/importCenter/applyImportOperations';
import {
  createImportCommand,
  deleteImportRunOperation,
  deleteImportedStandardOperation,
  putImportRunOperation,
  putImportedStandardOperation,
  serializeImportCommand,
  type ImportOperation,
} from '@/features/importCenter/importCommands';

import type { StandardImportFileKind } from './standardImportFileParser';
import type { StandardImportPreview } from './standardImportModel';

export interface CommitStandardImportOptions {
  fileKind: StandardImportFileKind;
  sourceLabel?: string;
  worksheetName: string;
  confirmUpdates: boolean;
  confirmCommit: boolean;
}

export interface StandardImportMutationDependencies {
  createId?: () => string;
}

export interface StandardImportCommitResult {
  created: Standard[];
  updated: Standard[];
  duplicateCount: number;
  log: ChangeLog;
}

function samePreviewRecord(current: Standard, preview: Standard): boolean {
  return JSON.stringify(current) === JSON.stringify(preview);
}

function identityOf(value: Pick<Standard, 'frameworkKey' | 'normalizedCode'>): string {
  return `${value.frameworkKey}\u0000${value.normalizedCode}`;
}

export class StandardImportMutationService {
  private readonly createId: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: StandardImportMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
  }

  async commit(
    preview: StandardImportPreview,
    options: CommitStandardImportOptions,
  ): Promise<StandardImportCommitResult> {
    if (!preview.canCommit) {
      throw new Error('Resolve every invalid or conflicting import row before committing.');
    }
    if (!options.confirmCommit) {
      throw new Error('Confirm that the reviewed preview should be committed.');
    }
    if (preview.summary.updateCount > 0 && !options.confirmUpdates) {
      throw new Error('Confirm the reviewed updates before committing this import.');
    }

    const result = await this.db.transaction(
      'rw',
      [this.db.standards, this.db.standardImportBatches, this.db.importRuns, this.db.changeLog],
      async (): Promise<StandardImportCommitResult> => {
        if (
          (await this.db.importRuns.get(preview.batchId)) ||
          (await this.db.standardImportBatches.get(preview.batchId))
        ) {
          throw new Error('This reviewed import batch has already been committed.');
        }

        const currentValues = (await this.db.standards.toArray()).map((value) =>
          standardSchema.parse(value),
        );
        const currentById = new Map(currentValues.map((value) => [value.id, value]));
        const currentByIdentity = new Map(currentValues.map((value) => [identityOf(value), value]));
        const created: Standard[] = [];
        const updated: Standard[] = [];
        const inverseStandards: ImportOperation[] = [];
        const forwardStandards: ImportOperation[] = [];

        for (const row of preview.rows) {
          if (row.classification === 'exact-duplicate') {
            const expected = row.existingStandard;
            const current = expected ? currentById.get(expected.id) : undefined;
            if (!expected || !current || !samePreviewRecord(current, expected)) {
              throw new Error(
                `Row ${row.rowNumber} changed after preview. Generate a new preview.`,
              );
            }
            continue;
          }
          if (row.classification !== 'valid-new' && row.classification !== 'reviewed-update') {
            throw new Error(`Row ${row.rowNumber} is not eligible for import.`);
          }
          const planned = row.plannedStandard;
          if (!planned) throw new Error(`Row ${row.rowNumber} has no reviewed Standard record.`);
          const identity = currentByIdentity.get(identityOf(planned));

          if (row.classification === 'valid-new') {
            if (currentById.has(planned.id) || identity) {
              throw new Error(`Row ${row.rowNumber} identity changed after preview.`);
            }
            created.push(planned);
            forwardStandards.push(putImportedStandardOperation(planned));
            inverseStandards.unshift(deleteImportedStandardOperation(planned.id));
            currentById.set(planned.id, planned);
            currentByIdentity.set(identityOf(planned), planned);
          } else {
            const expected = row.existingStandard;
            const current = expected ? currentById.get(expected.id) : undefined;
            if (!expected || !current || !samePreviewRecord(current, expected)) {
              throw new Error(
                `Row ${row.rowNumber} changed after preview. Generate a new preview.`,
              );
            }
            if (identity && identity.id !== expected.id) {
              throw new Error(`Row ${row.rowNumber} identity now conflicts with another Standard.`);
            }
            updated.push(planned);
            forwardStandards.push(putImportedStandardOperation(planned));
            inverseStandards.unshift(putImportedStandardOperation(expected));
            currentById.set(planned.id, planned);
            currentByIdentity.set(identityOf(planned), planned);
          }
        }

        this.validateHierarchy([...currentById.values()]);
        const importRun = importRunSchema.parse({
          id: preview.batchId,
          importType: 'standards',
          sourceKind: options.fileKind,
          sourceLabel: options.sourceLabel?.trim() || preview.source.sourceName,
          worksheetName: options.worksheetName,
          totalRows: preview.summary.total,
          createdCount: preview.summary.newCount,
          updatedCount: preview.summary.updateCount,
          skippedCount: preview.summary.duplicateCount,
          reviewCount: 0,
          blockedCount: 0,
          summaryJson: JSON.stringify({ source: preview.source }),
          committedAt: preview.generatedAt,
        });
        const forward = createImportCommand([
          putImportRunOperation(importRun),
          ...forwardStandards,
        ]);
        const inverse = createImportCommand([
          ...inverseStandards,
          deleteImportRunOperation(importRun.id),
        ]);
        const log = changeLogSchema.parse({
          id: this.createId(),
          label: `Import ${preview.summary.newCount + preview.summary.updateCount} reviewed Standards`,
          commandType: 'import-center.standards.reviewed',
          forwardJson: serializeImportCommand(forward),
          inverseJson: serializeImportCommand(inverse),
          createdAt: preview.generatedAt,
        });
        await clearSupportedRedoBranch(this.db);
        await applyImportOperations(this.db, forward.operations);
        await this.db.changeLog.put(log);
        return {
          created,
          updated,
          duplicateCount: preview.summary.duplicateCount,
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

  private validateHierarchy(standards: readonly Standard[]): void {
    const byId = new Map(standards.map((value) => [value.id, value]));
    for (const standard of standards) {
      if (!standard.parentStandardId) continue;
      const parent = byId.get(standard.parentStandardId);
      if (!parent) throw new Error(`Parent Standard for ${standard.code} no longer exists.`);
      if (parent.frameworkKey !== standard.frameworkKey) {
        throw new Error(`Parent and child Standards must share a framework (${standard.code}).`);
      }
      const visited = new Set<string>([standard.id]);
      let cursor: Standard | undefined = parent;
      while (cursor) {
        if (visited.has(cursor.id)) {
          throw new Error(
            `The reviewed import would create a hierarchy cycle at ${standard.code}.`,
          );
        }
        visited.add(cursor.id);
        cursor = cursor.parentStandardId ? byId.get(cursor.parentStandardId) : undefined;
      }
    }
  }
}

export const standardImportMutationService = new StandardImportMutationService();
