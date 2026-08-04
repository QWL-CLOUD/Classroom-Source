import {
  categoryValueSchema,
  classificationMappingPresetSchema,
  type CategoryFamilyId,
  type CategoryValue,
  type ClassificationMappingPreset,
} from '@/domain/models/entities';
import { normalizeCategoryName } from '@/features/categories/categoryNormalization';

import type { ImportOperation } from './importCommands';
import type {
  ImportClassificationDecision,
  ImportClassificationDecisions,
  ImportClassificationReview,
} from './importClassificationResolution';

export type ImportClassificationMappingPersistenceDecision = 'save' | 'update';

export type ImportClassificationMappingPersistenceDecisions = Record<
  string,
  ImportClassificationMappingPersistenceDecision | undefined
>;

export interface ImportClassificationMappingAuditRecord {
  action: 'created' | 'updated';
  presetId: string;
  familyId: CategoryFamilyId;
  importedText: string;
  normalizedText: string;
  targetCategoryValueId: string;
  targetName: string;
}

export interface ImportClassificationMappingPresetPlanSnapshot {
  newMappingPresets: ClassificationMappingPreset[];
  updatedMappingPresets: Array<{
    before: ClassificationMappingPreset;
    after: ClassificationMappingPreset;
  }>;
  expectedMappingPresets: ClassificationMappingPreset[];
  classificationMappingAudit: ImportClassificationMappingAuditRecord[];
}

export interface PlanImportClassificationMappingPresetsInput {
  reviews: readonly ImportClassificationReview[];
  decisions: ImportClassificationDecisions;
  persistenceDecisions: ImportClassificationMappingPersistenceDecisions;
  categoryValues: readonly CategoryValue[];
  mappingPresets: readonly ClassificationMappingPreset[];
  createId: () => string;
  generatedAt: string;
}

export function importClassificationMappingPresetKey(
  familyId: CategoryFamilyId,
  normalizedSourceText: string,
): string {
  return `${familyId}\u0000${normalizedSourceText}`;
}

function comparePreset(
  first: ClassificationMappingPreset,
  second: ClassificationMappingPreset,
): number {
  return (
    first.familyId.localeCompare(second.familyId) ||
    first.normalizedSourceText.localeCompare(second.normalizedSourceText) ||
    first.id.localeCompare(second.id)
  );
}

function compareAudit(
  first: ImportClassificationMappingAuditRecord,
  second: ImportClassificationMappingAuditRecord,
): number {
  return (
    first.familyId.localeCompare(second.familyId) ||
    first.normalizedText.localeCompare(second.normalizedText) ||
    first.action.localeCompare(second.action) ||
    first.presetId.localeCompare(second.presetId)
  );
}

function selectedTarget(
  review: ImportClassificationReview,
  decision: ImportClassificationDecision | undefined,
  valueById: ReadonlyMap<string, CategoryValue>,
): CategoryValue | undefined {
  if (!decision || (decision.action !== 'use' && decision.action !== 'restore')) {
    return undefined;
  }
  const selected = valueById.get(decision.categoryValueId);
  return selected?.familyId === review.familyId ? selected : undefined;
}

export function planImportClassificationMappingPresets(
  input: PlanImportClassificationMappingPresetsInput,
): ImportClassificationMappingPresetPlanSnapshot {
  const categoryValues = input.categoryValues.map((value) => categoryValueSchema.parse(value));
  const valueById = new Map(categoryValues.map((value) => [value.id, value] as const));
  const mappingPresets = input.mappingPresets.map((preset) =>
    classificationMappingPresetSchema.parse(preset),
  );
  const mappingsByKey = new Map<string, ClassificationMappingPreset[]>();
  for (const preset of mappingPresets) {
    const key = importClassificationMappingPresetKey(preset.familyId, preset.normalizedSourceText);
    const values = mappingsByKey.get(key) ?? [];
    values.push(preset);
    mappingsByKey.set(key, values);
  }

  const newMappingPresets: ClassificationMappingPreset[] = [];
  const updatedMappingPresets: Array<{
    before: ClassificationMappingPreset;
    after: ClassificationMappingPreset;
  }> = [];
  const expectedById = new Map<string, ClassificationMappingPreset>();
  const classificationMappingAudit: ImportClassificationMappingAuditRecord[] = [];
  const plannedKeys = new Set<string>();

  for (const review of input.reviews) {
    const persistence = input.persistenceDecisions[review.key];
    if (!persistence) continue;

    const decision = input.decisions[review.key];
    const target = selectedTarget(review, decision, valueById);
    if (!target) {
      throw new Error(
        `Choose an existing controlled ${review.familyLabel.toLocaleLowerCase('en-US')} value before saving an import mapping.`,
      );
    }
    if (decision?.action === 'use' && target.lifecycleState !== 'active') {
      throw new Error(`The selected controlled value “${target.name}” is not active.`);
    }
    if (decision?.action === 'restore' && target.lifecycleState !== 'archived') {
      throw new Error(
        `Only an archived controlled value can be restored for “${review.displayValue}”.`,
      );
    }

    const key = importClassificationMappingPresetKey(review.familyId, review.normalizedValue);
    if (plannedKeys.has(key)) continue;
    plannedKeys.add(key);
    const existing = mappingsByKey.get(key) ?? [];

    if (persistence === 'save') {
      if (review.kind !== 'unknown' || decision?.action !== 'use') {
        throw new Error(
          `Only an unknown imported value mapped to an existing active controlled value can be saved as a new import mapping.`,
        );
      }
      if (existing.length > 0) {
        throw new Error(
          `An import mapping for “${review.displayValue}” already exists. Choose Update instead.`,
        );
      }
      const record = classificationMappingPresetSchema.parse({
        id: input.createId(),
        familyId: review.familyId,
        sourceText: review.displayValue,
        normalizedSourceText: normalizeCategoryName(review.displayValue),
        targetCategoryValueId: target.id,
        status: 'active',
        createdAt: input.generatedAt,
        updatedAt: input.generatedAt,
      });
      newMappingPresets.push(record);
      classificationMappingAudit.push({
        action: 'created',
        presetId: record.id,
        familyId: record.familyId,
        importedText: review.displayValue,
        normalizedText: review.normalizedValue,
        targetCategoryValueId: target.id,
        targetName: target.name,
      });
      continue;
    }

    if (existing.length !== 1) {
      throw new Error(
        existing.length === 0
          ? `No saved import mapping exists for “${review.displayValue}”. Choose Save instead.`
          : `Multiple saved import mappings match “${review.displayValue}”. Resolve the conflict in Categories & Labels.`,
      );
    }
    const before = existing[0];
    if (!before) continue;
    expectedById.set(before.id, before);
    const after = classificationMappingPresetSchema.parse({
      ...before,
      targetCategoryValueId: target.id,
      status: 'active',
      updatedAt: input.generatedAt,
      deactivatedAt: undefined,
    });
    updatedMappingPresets.push({ before, after });
    classificationMappingAudit.push({
      action: 'updated',
      presetId: before.id,
      familyId: before.familyId,
      importedText: review.displayValue,
      normalizedText: review.normalizedValue,
      targetCategoryValueId: target.id,
      targetName: target.name,
    });
  }

  return {
    newMappingPresets: newMappingPresets.sort(comparePreset),
    updatedMappingPresets: updatedMappingPresets.sort((first, second) =>
      comparePreset(first.before, second.before),
    ),
    expectedMappingPresets: [...expectedById.values()].sort(comparePreset),
    classificationMappingAudit: classificationMappingAudit.sort(compareAudit),
  };
}

export function importClassificationMappingPresetOperations(input: {
  newMappingPresets: readonly ClassificationMappingPreset[];
  updatedMappingPresets: readonly {
    before: ClassificationMappingPreset;
    after: ClassificationMappingPreset;
  }[];
}): {
  forward: ImportOperation[];
  inverse: ImportOperation[];
} {
  const forward: ImportOperation[] = [];
  const inverse: ImportOperation[] = [];
  for (const preset of input.newMappingPresets) {
    forward.push({ action: 'put', table: 'classificationMappingPresets', record: preset });
    inverse.unshift({ action: 'delete', table: 'classificationMappingPresets', id: preset.id });
  }
  for (const change of input.updatedMappingPresets) {
    forward.push({ action: 'put', table: 'classificationMappingPresets', record: change.after });
    inverse.unshift({
      action: 'put',
      table: 'classificationMappingPresets',
      record: change.before,
    });
  }
  return { forward, inverse };
}

function sameRecord(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export async function validateImportClassificationMappingPresetState(input: {
  db: import('@/data/db/ClassroomDatabase').ClassroomDatabase;
  expectedMappingPresets: readonly ClassificationMappingPreset[];
  newMappingPresets: readonly ClassificationMappingPreset[];
  updatedMappingPresets: readonly {
    before: ClassificationMappingPreset;
    after: ClassificationMappingPreset;
  }[];
  categoryValuesAfterCommit: readonly CategoryValue[];
}): Promise<void> {
  const categoryValues = input.categoryValuesAfterCommit.map((value) =>
    categoryValueSchema.parse(value),
  );
  const valueById = new Map(categoryValues.map((value) => [value.id, value] as const));

  for (const expected of input.expectedMappingPresets) {
    const current = await input.db.classificationMappingPresets.get(expected.id);
    if (!current || !sameRecord(classificationMappingPresetSchema.parse(current), expected)) {
      throw new Error(
        `Import mapping “${expected.sourceText}” changed after preview. Generate a new preview.`,
      );
    }
  }

  const assertTargetAndCanonicalSafety = (preset: ClassificationMappingPreset): void => {
    const target = valueById.get(preset.targetCategoryValueId);
    if (!target || target.familyId !== preset.familyId || target.lifecycleState !== 'active') {
      throw new Error(
        `Import mapping “${preset.sourceText}” no longer has a safe active target. Generate a new preview.`,
      );
    }
    const collision = categoryValues.find(
      (value) =>
        value.familyId === preset.familyId &&
        value.lifecycleState === 'active' &&
        (value.normalizedName === preset.normalizedSourceText ||
          value.normalizedAliases.includes(preset.normalizedSourceText)),
    );
    if (collision) {
      throw new Error(
        `Import mapping “${preset.sourceText}” now conflicts with controlled value “${collision.name}”. Generate a new preview.`,
      );
    }
  };

  for (const preset of input.newMappingPresets) {
    if (await input.db.classificationMappingPresets.get(preset.id)) {
      throw new Error(
        `New import mapping “${preset.sourceText}” changed after preview. Generate a new preview.`,
      );
    }
    const collision = await input.db.classificationMappingPresets
      .where('[familyId+normalizedSourceText]')
      .equals([preset.familyId, preset.normalizedSourceText])
      .first();
    if (collision) {
      throw new Error(
        `An import mapping for “${preset.sourceText}” was created after preview. Generate a new preview.`,
      );
    }
    assertTargetAndCanonicalSafety(preset);
  }

  for (const change of input.updatedMappingPresets) {
    const current = await input.db.classificationMappingPresets.get(change.before.id);
    if (!current || !sameRecord(classificationMappingPresetSchema.parse(current), change.before)) {
      throw new Error(
        `Import mapping “${change.before.sourceText}” changed after preview. Generate a new preview.`,
      );
    }
    const collision = await input.db.classificationMappingPresets
      .where('[familyId+normalizedSourceText]')
      .equals([change.after.familyId, change.after.normalizedSourceText])
      .first();
    if (collision && collision.id !== change.after.id) {
      throw new Error(
        `Another import mapping now uses “${change.after.sourceText}”. Generate a new preview.`,
      );
    }
    assertTargetAndCanonicalSafety(change.after);
  }
}
