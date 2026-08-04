import { z } from 'zod';

import { classroomDb, type ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  categoryFamilyIdSchema,
  categoryValueSchema,
  changeLogSchema,
  classificationMappingPresetSchema,
  type CategoryFamilyId,
  type CategoryValue,
  type ChangeLog,
  type ClassificationMappingPreset,
} from '@/domain/models/entities';
import { clearSupportedRedoBranch } from '@/features/editing/editCommandRegistry';
import { notifyEditHistoryChanged } from '@/features/editing/editHistorySignal';

import {
  createCategoryCommand,
  deleteClassificationMappingPresetOperation,
  putClassificationMappingPresetOperation,
  serializeCategoryCommand,
  type CategoryCommandPair,
  type CategoryOperation,
} from './categoryCommands';
import { normalizeCategoryName } from './categoryNormalization';

export const classificationMappingPresetEditorValuesSchema = z.object({
  sourceText: z.string().trim().min(1, 'Enter the external text.').max(240),
  targetCategoryValueId: z.string().min(1, 'Choose a controlled value.'),
});

export type ClassificationMappingPresetEditorValues = z.input<
  typeof classificationMappingPresetEditorValuesSchema
>;

export interface ClassificationMappingPresetMutationDependencies {
  createId?: () => string;
  now?: () => string;
}

interface CommitResult<T> {
  value: T;
  log: ChangeLog;
}

export class ClassificationMappingPresetConflictError extends Error {
  constructor(readonly normalizedSourceText: string) {
    super('An import mapping for this external text already exists in the selected family.');
    this.name = 'ClassificationMappingPresetConflictError';
  }
}

export class ClassificationMappingPresetCanonicalCollisionError extends Error {
  constructor(readonly sourceText: string) {
    super(
      `“${sourceText.trim()}” already matches an active controlled name or alias. A mapping is not needed.`,
    );
    this.name = 'ClassificationMappingPresetCanonicalCollisionError';
  }
}

export class ClassificationMappingPresetMutationService {
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly db: ClassroomDatabase = classroomDb,
    dependencies: ClassificationMappingPresetMutationDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async create(
    familyId: CategoryFamilyId,
    values: ClassificationMappingPresetEditorValues,
  ): Promise<ClassificationMappingPreset> {
    const parsedFamilyId = categoryFamilyIdSchema.parse(familyId);
    const parsed = classificationMappingPresetEditorValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.classificationMappingPresets,
      this.db.changeLog,
      async (): Promise<CommitResult<ClassificationMappingPreset>> => {
        const target = await this.requireSafeTarget(parsedFamilyId, parsed.targetCategoryValueId);
        const normalizedSourceText = normalizeCategoryName(parsed.sourceText);
        await this.assertSourceAvailable(parsedFamilyId, parsed.sourceText, normalizedSourceText);
        const now = this.now();
        const record = classificationMappingPresetSchema.parse({
          id: this.createId(),
          familyId: parsedFamilyId,
          sourceText: parsed.sourceText,
          normalizedSourceText,
          targetCategoryValueId: target.id,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        });
        const commands: CategoryCommandPair = {
          forward: createCategoryCommand([putClassificationMappingPresetOperation(record)]),
          inverse: createCategoryCommand([deleteClassificationMappingPresetOperation(record.id)]),
        };
        const log = this.createChangeLog(
          'category.mapping-preset.create',
          `Create import mapping “${record.sourceText}” → “${target.name}”`,
          commands,
          now,
        );
        await this.commit(commands.forward.operations, log);
        return { value: record, log };
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async update(
    id: string,
    values: ClassificationMappingPresetEditorValues,
  ): Promise<ClassificationMappingPreset> {
    const parsed = classificationMappingPresetEditorValuesSchema.parse(values);
    const result = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.classificationMappingPresets,
      this.db.changeLog,
      async (): Promise<CommitResult<ClassificationMappingPreset>> => {
        const existing = await this.requirePreset(id);
        const target = await this.requireSafeTarget(
          existing.familyId,
          parsed.targetCategoryValueId,
        );
        const normalizedSourceText = normalizeCategoryName(parsed.sourceText);
        await this.assertSourceAvailable(
          existing.familyId,
          parsed.sourceText,
          normalizedSourceText,
          existing.id,
        );
        if (
          parsed.sourceText === existing.sourceText &&
          normalizedSourceText === existing.normalizedSourceText &&
          target.id === existing.targetCategoryValueId
        ) {
          throw new Error('The import mapping is unchanged.');
        }
        const updated = classificationMappingPresetSchema.parse({
          ...existing,
          sourceText: parsed.sourceText,
          normalizedSourceText,
          targetCategoryValueId: target.id,
          updatedAt: this.now(),
        });
        return this.commitSingleChange(
          existing,
          updated,
          'category.mapping-preset.update',
          `Update import mapping “${existing.sourceText}”`,
        );
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async setStatus(
    id: string,
    status: ClassificationMappingPreset['status'],
  ): Promise<ClassificationMappingPreset> {
    const parsedStatus = z.enum(['active', 'inactive']).parse(status);
    const result = await this.db.transaction(
      'rw',
      this.db.categoryValues,
      this.db.classificationMappingPresets,
      this.db.changeLog,
      async (): Promise<CommitResult<ClassificationMappingPreset>> => {
        const existing = await this.requirePreset(id);
        if (existing.status === parsedStatus) {
          throw new Error(`The import mapping is already ${parsedStatus}.`);
        }
        if (parsedStatus === 'active') {
          await this.requireSafeTarget(existing.familyId, existing.targetCategoryValueId);
          await this.assertSourceAvailable(
            existing.familyId,
            existing.sourceText,
            existing.normalizedSourceText,
            existing.id,
          );
        }
        const now = this.now();
        const updated = classificationMappingPresetSchema.parse({
          ...existing,
          status: parsedStatus,
          deactivatedAt: parsedStatus === 'inactive' ? now : undefined,
          updatedAt: now,
        });
        return this.commitSingleChange(
          existing,
          updated,
          parsedStatus === 'active'
            ? 'category.mapping-preset.activate'
            : 'category.mapping-preset.deactivate',
          `${parsedStatus === 'active' ? 'Activate' : 'Deactivate'} import mapping “${existing.sourceText}”`,
        );
      },
    );
    this.notifyNewChange(result.log);
    return result.value;
  }

  async delete(id: string): Promise<void> {
    const log = await this.db.transaction(
      'rw',
      this.db.classificationMappingPresets,
      this.db.changeLog,
      async (): Promise<ChangeLog> => {
        const existing = await this.requirePreset(id);
        const commands: CategoryCommandPair = {
          forward: createCategoryCommand([deleteClassificationMappingPresetOperation(existing.id)]),
          inverse: createCategoryCommand([putClassificationMappingPresetOperation(existing)]),
        };
        const nextLog = this.createChangeLog(
          'category.mapping-preset.delete',
          `Delete import mapping “${existing.sourceText}”`,
          commands,
        );
        await this.commit(commands.forward.operations, nextLog);
        return nextLog;
      },
    );
    this.notifyNewChange(log);
  }

  private async requirePreset(id: string): Promise<ClassificationMappingPreset> {
    const value = await this.db.classificationMappingPresets.get(id);
    if (!value) throw new Error('The import mapping no longer exists.');
    return classificationMappingPresetSchema.parse(value);
  }

  private async requireSafeTarget(
    familyId: CategoryFamilyId,
    targetCategoryValueId: string,
  ): Promise<CategoryValue> {
    const value = await this.db.categoryValues.get(targetCategoryValueId);
    if (!value) throw new Error('The controlled target value no longer exists.');
    const parsed = categoryValueSchema.parse(value);
    if (parsed.familyId !== familyId) {
      throw new Error('The mapping target must belong to the same category family.');
    }
    if (parsed.lifecycleState !== 'active') {
      throw new Error('Only an active controlled value can be a mapping target.');
    }
    return parsed;
  }

  private async assertSourceAvailable(
    familyId: CategoryFamilyId,
    sourceText: string,
    normalizedSourceText: string,
    excludedPresetId?: string,
  ): Promise<void> {
    const values = (await this.db.categoryValues.where('familyId').equals(familyId).toArray()).map(
      (value) => categoryValueSchema.parse(value),
    );
    if (
      values.some(
        (value) =>
          value.lifecycleState === 'active' &&
          (value.normalizedName === normalizedSourceText ||
            value.normalizedAliases.includes(normalizedSourceText)),
      )
    ) {
      throw new ClassificationMappingPresetCanonicalCollisionError(sourceText);
    }

    const existing = await this.db.classificationMappingPresets
      .where('[familyId+normalizedSourceText]')
      .equals([familyId, normalizedSourceText])
      .first();
    if (existing && existing.id !== excludedPresetId) {
      throw new ClassificationMappingPresetConflictError(normalizedSourceText);
    }
  }

  private async commitSingleChange(
    existing: ClassificationMappingPreset,
    updated: ClassificationMappingPreset,
    commandType: string,
    label: string,
  ): Promise<CommitResult<ClassificationMappingPreset>> {
    const commands: CategoryCommandPair = {
      forward: createCategoryCommand([putClassificationMappingPresetOperation(updated)]),
      inverse: createCategoryCommand([putClassificationMappingPresetOperation(existing)]),
    };
    const log = this.createChangeLog(commandType, label, commands, updated.updatedAt);
    await this.commit(commands.forward.operations, log);
    return { value: updated, log };
  }

  private async commit(operations: readonly CategoryOperation[], log: ChangeLog): Promise<void> {
    await clearSupportedRedoBranch(this.db);
    for (const operation of operations) {
      if (operation.table !== 'classificationMappingPresets') {
        throw new Error('Mapping preset service received an unsupported category operation.');
      }
      if (operation.action === 'put') {
        await this.db.classificationMappingPresets.put(operation.record);
      } else {
        await this.db.classificationMappingPresets.delete(operation.id);
      }
    }
    await this.db.changeLog.put(log);
  }

  private createChangeLog(
    commandType: string,
    label: string,
    commands: CategoryCommandPair,
    createdAt = this.now(),
  ): ChangeLog {
    return changeLogSchema.parse({
      id: this.createId(),
      label,
      commandType,
      forwardJson: serializeCategoryCommand(commands.forward),
      inverseJson: serializeCategoryCommand(commands.inverse),
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

export const classificationMappingPresetMutationService =
  new ClassificationMappingPresetMutationService();
