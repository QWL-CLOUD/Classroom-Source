import {
  categoryAssignmentSchema,
  categoryValueSchema,
  type CategoryAssignment,
  type CategoryFamilyId,
  type CategoryValue,
} from '@/domain/models/entities';
import {
  getCategoryFamily,
  type CategorySelectionMode,
} from '@/features/categories/categoryFamilies';
import { normalizeCategoryName } from '@/features/categories/categoryNormalization';
import { normalizeImportText } from '@/features/importCenter/importTableModel';

export type ImportClassificationCatalogType = 'activity' | 'resource' | 'assessment';

export interface ImportClassificationFieldDefinition {
  familyId: CategoryFamilyId;
  fieldLabel: string;
  genericTagPrefix: string;
}

const COMMON_FIELDS = [
  { familyId: 'subject', fieldLabel: 'Subject', genericTagPrefix: 'Subject' },
  { familyId: 'grade-level', fieldLabel: 'Grade Level', genericTagPrefix: 'Grade' },
  { familyId: 'language', fieldLabel: 'Language', genericTagPrefix: 'Language' },
  {
    familyId: 'language-level',
    fieldLabel: 'Language Level',
    genericTagPrefix: 'Language level',
  },
] as const satisfies readonly ImportClassificationFieldDefinition[];

const PURPOSE_AND_FOCUS_FIELDS = [
  { familyId: 'purpose-tag', fieldLabel: 'Purpose', genericTagPrefix: 'Purpose' },
  { familyId: 'focus-tag', fieldLabel: 'Skill / Focus', genericTagPrefix: 'Focus' },
] as const satisfies readonly ImportClassificationFieldDefinition[];

export const IMPORT_CLASSIFICATION_FIELDS = {
  activity: [
    ...COMMON_FIELDS,
    {
      familyId: 'activity-type',
      fieldLabel: 'Activity Type',
      genericTagPrefix: 'Activity type',
    },
    ...PURPOSE_AND_FOCUS_FIELDS,
  ],
  resource: [
    ...COMMON_FIELDS,
    {
      familyId: 'resource-format',
      fieldLabel: 'Resource Format',
      genericTagPrefix: 'Resource type',
    },
    ...PURPOSE_AND_FOCUS_FIELDS,
  ],
  assessment: [...COMMON_FIELDS, ...PURPOSE_AND_FOCUS_FIELDS],
} as const satisfies Record<
  ImportClassificationCatalogType,
  readonly ImportClassificationFieldDefinition[]
>;

export function importClassificationFieldsForCatalogType(
  catalogType: ImportClassificationCatalogType,
): readonly ImportClassificationFieldDefinition[] {
  return IMPORT_CLASSIFICATION_FIELDS[catalogType];
}

export type ImportClassificationDecision =
  | { action: 'use'; categoryValueId: string }
  | { action: 'restore'; categoryValueId: string }
  | { action: 'create' }
  | { action: 'generic-tag' }
  | { action: 'ignore' };

export type ImportClassificationDecisions = Record<
  string,
  ImportClassificationDecision | undefined
>;

export type ImportClassificationReviewKind = 'unknown' | 'archived' | 'merged' | 'ambiguous';

export interface ImportClassificationReview {
  key: string;
  familyId: CategoryFamilyId;
  familyLabel: string;
  fieldLabel: string;
  genericTagPrefix: string;
  displayValue: string;
  normalizedValue: string;
  kind: ImportClassificationReviewKind;
  matches: CategoryValue[];
  matchedValue?: CategoryValue;
  replacementValue?: CategoryValue;
}

export type ImportClassificationAuditResolution =
  | 'exact-name'
  | 'exact-alias'
  | 'use-existing'
  | 'merged-replacement'
  | 'restored'
  | 'created'
  | 'generic-tag'
  | 'ignored';

export interface ImportClassificationAuditRecord {
  familyId: CategoryFamilyId;
  importedText: string;
  normalizedText: string;
  occurrenceCount: number;
  resolution: ImportClassificationAuditResolution;
  categoryValueId?: string;
  resultingName?: string;
}

export interface ImportClassificationResolvedFamily {
  familyId: CategoryFamilyId;
  fieldLabel: string;
  inputPresent: boolean;
  hadInput: boolean;
  categoryValueIds: string[];
  genericTags: string[];
}

export interface ImportClassificationRowResolution {
  sourceRow: number;
  families: ImportClassificationResolvedFamily[];
  reviews: ImportClassificationReview[];
  reviewReasons: string[];
  blockingReasons: string[];
  genericTags: string[];
}

export interface ResolveImportClassificationRowInput {
  sourceRow: number;
  values: Partial<Record<CategoryFamilyId, string | undefined>>;
  presentFamilyIds: readonly CategoryFamilyId[];
}

export interface ImportClassificationResolutionSnapshot {
  newCategoryValues: CategoryValue[];
  restoredCategoryValues: Array<{ before: CategoryValue; after: CategoryValue }>;
  expectedCategoryValues: CategoryValue[];
  classificationReviews: ImportClassificationReview[];
  classificationAudit: ImportClassificationAuditRecord[];
}

export interface CreateImportClassificationResolutionSessionInput {
  catalogType: ImportClassificationCatalogType;
  categoryValues: readonly CategoryValue[];
  decisions: ImportClassificationDecisions;
  createId: () => string;
  generatedAt: string;
}

export interface ImportClassificationAssignmentPlan {
  expectedAssignments: CategoryAssignment[];
  assignmentsToDelete: CategoryAssignment[];
  assignmentsToCreate: CategoryAssignment[];
  desiredCategoryValueIds: string[];
  desiredCategoryValueIdsByFamily: Partial<Record<CategoryFamilyId, string[]>>;
}

function compareCategoryValue(first: CategoryValue, second: CategoryValue): number {
  return (
    first.sortOrder - second.sortOrder ||
    first.name.localeCompare(second.name) ||
    first.id.localeCompare(second.id)
  );
}

function compareAssignment(first: CategoryAssignment, second: CategoryAssignment): number {
  return first.id.localeCompare(second.id);
}

function uniqueDisplays(
  rawValue: string,
  mode: CategorySelectionMode,
): {
  values: string[];
  tooManyForSingle: boolean;
} {
  const normalizedRaw = normalizeImportText(rawValue);
  if (!normalizedRaw) return { values: [], tooManyForSingle: false };
  const unique = new Map<string, string>();
  for (const entry of normalizedRaw.split(/[;|\n]+/)) {
    const display = normalizeImportText(entry);
    if (!display) continue;
    const normalized = normalizeCategoryName(display);
    if (!unique.has(normalized)) unique.set(normalized, display);
  }
  const values = [...unique.values()];
  return { values, tooManyForSingle: mode === 'single' && values.length > 1 };
}

function reviewKey(familyId: CategoryFamilyId, displayValue: string): string {
  return `${familyId}\u0000${normalizeCategoryName(displayValue)}`;
}

export function importClassificationReviewKey(
  familyId: CategoryFamilyId,
  displayValue: string,
): string {
  return reviewKey(familyId, displayValue);
}

function uniqueMatches(values: readonly CategoryValue[]): CategoryValue[] {
  return [...new Map(values.map((value) => [value.id, value])).values()].sort(compareCategoryValue);
}

function reviewMessage(review: ImportClassificationReview): string {
  if (review.kind === 'unknown') {
    return `Review ${review.fieldLabel} value “${review.displayValue}”.`;
  }
  if (review.kind === 'archived') {
    return `${review.fieldLabel} value “${review.displayValue}” matches an archived controlled value.`;
  }
  if (review.kind === 'merged') {
    return `${review.fieldLabel} value “${review.displayValue}” matches merged classification history.`;
  }
  return `${review.fieldLabel} value “${review.displayValue}” matches multiple controlled values.`;
}

function auditKey(record: Omit<ImportClassificationAuditRecord, 'occurrenceCount'>): string {
  return [
    record.familyId,
    record.normalizedText,
    record.resolution,
    record.categoryValueId ?? '',
    record.resultingName ?? '',
  ].join('\u0000');
}

export function createImportClassificationResolutionSession(
  input: CreateImportClassificationResolutionSessionInput,
) {
  const definitions = importClassificationFieldsForCatalogType(input.catalogType);
  const applicableFamilyIds = new Set(definitions.map((definition) => definition.familyId));
  const values = input.categoryValues.map((value) => categoryValueSchema.parse(value));
  const valueById = new Map(values.map((value) => [value.id, value] as const));
  const valuesByFamily = new Map<CategoryFamilyId, CategoryValue[]>();
  for (const value of values) {
    const familyValues = valuesByFamily.get(value.familyId) ?? [];
    familyValues.push(value);
    valuesByFamily.set(value.familyId, familyValues);
  }
  for (const familyValues of valuesByFamily.values()) familyValues.sort(compareCategoryValue);

  const nextSortOrder = new Map<CategoryFamilyId, number>();
  for (const familyId of applicableFamilyIds) {
    nextSortOrder.set(
      familyId,
      Math.max(-1, ...(valuesByFamily.get(familyId) ?? []).map((value) => value.sortOrder)) + 1,
    );
  }

  const newCategoryByKey = new Map<string, CategoryValue>();
  const restoredCategoryById = new Map<string, { before: CategoryValue; after: CategoryValue }>();
  const expectedCategoryById = new Map<string, CategoryValue>();
  const reviewsByKey = new Map<string, ImportClassificationReview>();
  const auditByKey = new Map<string, ImportClassificationAuditRecord>();
  const resolvedRows = new Set<number>();

  function addExpected(value: CategoryValue | undefined): void {
    if (value) expectedCategoryById.set(value.id, value);
  }

  function addAudit(record: Omit<ImportClassificationAuditRecord, 'occurrenceCount'>): void {
    const key = auditKey(record);
    const current = auditByKey.get(key);
    if (current) {
      current.occurrenceCount += 1;
      return;
    }
    auditByKey.set(key, { ...record, occurrenceCount: 1 });
  }

  function allMatches(familyId: CategoryFamilyId, normalizedValue: string): CategoryValue[] {
    return uniqueMatches(
      (valuesByFamily.get(familyId) ?? []).filter(
        (value) =>
          value.normalizedName === normalizedValue ||
          value.normalizedAliases.includes(normalizedValue),
      ),
    );
  }

  function buildReview(
    definition: ImportClassificationFieldDefinition,
    displayValue: string,
    matches: CategoryValue[],
  ): ImportClassificationReview {
    const normalizedValue = normalizeCategoryName(displayValue);
    const single = matches.length === 1 ? matches[0] : undefined;
    const replacementValue =
      single?.lifecycleState === 'merged' && single.mergedIntoId
        ? valueById.get(single.mergedIntoId)
        : undefined;
    const kind: ImportClassificationReviewKind =
      matches.length > 1
        ? 'ambiguous'
        : single?.lifecycleState === 'archived'
          ? 'archived'
          : single?.lifecycleState === 'merged'
            ? 'merged'
            : 'unknown';
    return {
      key: reviewKey(definition.familyId, displayValue),
      familyId: definition.familyId,
      familyLabel: getCategoryFamily(definition.familyId).label,
      fieldLabel: definition.fieldLabel,
      genericTagPrefix: definition.genericTagPrefix,
      displayValue,
      normalizedValue,
      kind,
      matches,
      matchedValue: single,
      replacementValue,
    };
  }

  function resolveReviewDecision(
    review: ImportClassificationReview,
    decision: ImportClassificationDecision | undefined,
  ): {
    categoryValueId?: string;
    genericTag?: string;
    unresolved?: ImportClassificationReview;
    reason?: string;
  } {
    for (const match of review.matches) addExpected(match);
    addExpected(review.replacementValue);

    if (!decision) return { unresolved: review, reason: reviewMessage(review) };

    if (decision.action === 'ignore') {
      addAudit({
        familyId: review.familyId,
        importedText: review.displayValue,
        normalizedText: review.normalizedValue,
        resolution: 'ignored',
      });
      return {};
    }

    if (decision.action === 'generic-tag') {
      const genericTag = `${review.genericTagPrefix}: ${review.displayValue}`;
      addAudit({
        familyId: review.familyId,
        importedText: review.displayValue,
        normalizedText: review.normalizedValue,
        resolution: 'generic-tag',
        resultingName: genericTag,
      });
      return { genericTag };
    }

    if (decision.action === 'create') {
      if (review.kind !== 'unknown') {
        return {
          unresolved: review,
          reason: `“${review.displayValue}” already matches controlled classification history and cannot be recreated.`,
        };
      }
      let created = newCategoryByKey.get(review.key);
      if (!created) {
        const sortOrder = nextSortOrder.get(review.familyId) ?? 0;
        nextSortOrder.set(review.familyId, sortOrder + 1);
        created = categoryValueSchema.parse({
          id: input.createId(),
          familyId: review.familyId,
          name: review.displayValue,
          normalizedName: review.normalizedValue,
          aliases: [],
          normalizedAliases: [],
          sortOrder,
          isDefault: false,
          lifecycleState: 'active',
          createdAt: input.generatedAt,
          updatedAt: input.generatedAt,
        });
        newCategoryByKey.set(review.key, created);
      }
      addAudit({
        familyId: review.familyId,
        importedText: review.displayValue,
        normalizedText: review.normalizedValue,
        resolution: 'created',
        categoryValueId: created.id,
        resultingName: created.name,
      });
      return { categoryValueId: created.id };
    }

    const selected = valueById.get(decision.categoryValueId);
    if (!selected || selected.familyId !== review.familyId) {
      return {
        unresolved: review,
        reason: `The selected ${review.fieldLabel} resolution is no longer available.`,
      };
    }
    addExpected(selected);

    if (decision.action === 'use') {
      if (selected.lifecycleState !== 'active') {
        return {
          unresolved: review,
          reason: `The selected controlled value “${selected.name}” is not active.`,
        };
      }
      const mergedReplacement =
        review.kind === 'merged' && review.replacementValue?.id === selected.id;
      addAudit({
        familyId: review.familyId,
        importedText: review.displayValue,
        normalizedText: review.normalizedValue,
        resolution: mergedReplacement ? 'merged-replacement' : 'use-existing',
        categoryValueId: selected.id,
        resultingName: selected.name,
      });
      return { categoryValueId: selected.id };
    }

    if (selected.lifecycleState !== 'archived') {
      return {
        unresolved: review,
        reason: `Only an archived controlled value can be restored for “${review.displayValue}”.`,
      };
    }
    let restored = restoredCategoryById.get(selected.id);
    if (!restored) {
      restored = {
        before: selected,
        after: categoryValueSchema.parse({
          ...selected,
          lifecycleState: 'active',
          archivedAt: undefined,
          updatedAt: input.generatedAt,
        }),
      };
      restoredCategoryById.set(selected.id, restored);
    }
    addAudit({
      familyId: review.familyId,
      importedText: review.displayValue,
      normalizedText: review.normalizedValue,
      resolution: 'restored',
      categoryValueId: selected.id,
      resultingName: selected.name,
    });
    return { categoryValueId: selected.id };
  }

  function resolveRow(row: ResolveImportClassificationRowInput): ImportClassificationRowResolution {
    if (resolvedRows.has(row.sourceRow)) {
      throw new Error(`Classification resolution for row ${row.sourceRow} was requested twice.`);
    }
    resolvedRows.add(row.sourceRow);

    const presentFamilyIds = new Set(row.presentFamilyIds);
    const families: ImportClassificationResolvedFamily[] = [];
    const reviews: ImportClassificationReview[] = [];
    const reviewReasons: string[] = [];
    const blockingReasons: string[] = [];
    const genericTags: string[] = [];

    for (const definition of definitions) {
      const familyId = definition.familyId;
      const inputPresent = presentFamilyIds.has(familyId);
      const rawValue = normalizeImportText(row.values[familyId] ?? '');
      const family = getCategoryFamily(familyId);
      const split = uniqueDisplays(rawValue, family.selectionMode);
      const familyCategoryValueIds: string[] = [];
      const familyGenericTags: string[] = [];

      if (split.tooManyForSingle) {
        blockingReasons.push(
          `${definition.fieldLabel} accepts one controlled value per item; split this source row before import.`,
        );
      } else {
        for (const displayValue of split.values) {
          const normalizedValue = normalizeCategoryName(displayValue);
          const matches = allMatches(familyId, normalizedValue);
          if (matches.length === 1 && matches[0]?.lifecycleState === 'active') {
            const matched = matches[0];
            addExpected(matched);
            const exactName = matched.normalizedName === normalizedValue;
            addAudit({
              familyId,
              importedText: displayValue,
              normalizedText: normalizedValue,
              resolution: exactName ? 'exact-name' : 'exact-alias',
              categoryValueId: matched.id,
              resultingName: matched.name,
            });
            familyCategoryValueIds.push(matched.id);
            continue;
          }

          const review = buildReview(definition, displayValue, matches);
          reviewsByKey.set(review.key, review);
          const resolved = resolveReviewDecision(review, input.decisions[review.key]);
          if (resolved.unresolved) {
            reviews.push(resolved.unresolved);
            reviewReasons.push(resolved.reason ?? reviewMessage(resolved.unresolved));
          }
          if (resolved.categoryValueId) familyCategoryValueIds.push(resolved.categoryValueId);
          if (resolved.genericTag) {
            familyGenericTags.push(resolved.genericTag);
            genericTags.push(resolved.genericTag);
          }
        }
      }

      families.push({
        familyId,
        fieldLabel: definition.fieldLabel,
        inputPresent,
        hadInput: split.values.length > 0,
        categoryValueIds: [...new Set(familyCategoryValueIds)],
        genericTags: [...new Set(familyGenericTags)],
      });
    }

    return {
      sourceRow: row.sourceRow,
      families,
      reviews,
      reviewReasons,
      blockingReasons,
      genericTags: [...new Set(genericTags)],
    };
  }

  function snapshot(): ImportClassificationResolutionSnapshot {
    return {
      newCategoryValues: [...newCategoryByKey.values()].sort(compareCategoryValue),
      restoredCategoryValues: [...restoredCategoryById.values()].sort((first, second) =>
        compareCategoryValue(first.before, second.before),
      ),
      expectedCategoryValues: [...expectedCategoryById.values()].sort(compareCategoryValue),
      classificationReviews: [...reviewsByKey.values()].sort(
        (first, second) =>
          first.familyLabel.localeCompare(second.familyLabel) ||
          first.displayValue.localeCompare(second.displayValue),
      ),
      classificationAudit: [...auditByKey.values()].sort(
        (first, second) =>
          first.familyId.localeCompare(second.familyId) ||
          first.normalizedText.localeCompare(second.normalizedText) ||
          first.resolution.localeCompare(second.resolution),
      ),
    };
  }

  return {
    applicableFamilyIds: [...applicableFamilyIds],
    resolveRow,
    snapshot,
  };
}

export function planImportClassificationAssignments(input: {
  entityId: string;
  existingAssignments: readonly CategoryAssignment[];
  resolution: ImportClassificationRowResolution;
  applicableFamilyIds: readonly CategoryFamilyId[];
  createId: () => string;
  generatedAt: string;
}): ImportClassificationAssignmentPlan {
  const applicable = new Set(input.applicableFamilyIds);
  const expectedAssignments = input.existingAssignments
    .map((assignment) => categoryAssignmentSchema.parse(assignment))
    .filter(
      (assignment) =>
        assignment.entityType === 'library-item' &&
        assignment.entityId === input.entityId &&
        applicable.has(assignment.familyId),
    )
    .sort(compareAssignment);
  const existingByFamily = new Map<CategoryFamilyId, CategoryAssignment[]>();
  for (const assignment of expectedAssignments) {
    const familyAssignments = existingByFamily.get(assignment.familyId) ?? [];
    familyAssignments.push(assignment);
    existingByFamily.set(assignment.familyId, familyAssignments);
  }

  const resolvedByFamily = new Map(
    input.resolution.families.map((family) => [family.familyId, family] as const),
  );
  const desiredCategoryValueIdsByFamily: Partial<Record<CategoryFamilyId, string[]>> = {};
  const assignmentsToDelete: CategoryAssignment[] = [];
  const assignmentsToCreate: CategoryAssignment[] = [];

  for (const familyId of input.applicableFamilyIds) {
    const existing = existingByFamily.get(familyId) ?? [];
    const existingIds = [...new Set(existing.map((assignment) => assignment.categoryValueId))];
    const resolved = resolvedByFamily.get(familyId);
    const shouldReplace = Boolean(
      resolved?.inputPresent && resolved.hadInput && resolved.categoryValueIds.length > 0,
    );
    const desiredIds = shouldReplace ? [...new Set(resolved?.categoryValueIds ?? [])] : existingIds;
    desiredCategoryValueIdsByFamily[familyId] = desiredIds;

    const desiredSet = new Set(desiredIds);
    for (const assignment of existing) {
      if (!desiredSet.has(assignment.categoryValueId)) assignmentsToDelete.push(assignment);
    }
    const existingSet = new Set(existingIds);
    for (const categoryValueId of desiredIds) {
      if (existingSet.has(categoryValueId)) continue;
      assignmentsToCreate.push(
        categoryAssignmentSchema.parse({
          id: input.createId(),
          familyId,
          categoryValueId,
          entityType: 'library-item',
          entityId: input.entityId,
          createdAt: input.generatedAt,
        }),
      );
    }
  }

  return {
    expectedAssignments,
    assignmentsToDelete: assignmentsToDelete.sort(compareAssignment),
    assignmentsToCreate: assignmentsToCreate.sort(compareAssignment),
    desiredCategoryValueIds: [
      ...new Set(
        input.applicableFamilyIds.flatMap(
          (familyId) => desiredCategoryValueIdsByFamily[familyId] ?? [],
        ),
      ),
    ],
    desiredCategoryValueIdsByFamily,
  };
}

export function classificationSummaryJson(input: {
  sourceFingerprint: string;
  defaults?: unknown;
  newCategoryValues: readonly CategoryValue[];
  restoredCategoryValues: readonly { before: CategoryValue; after: CategoryValue }[];
  classificationAudit: readonly ImportClassificationAuditRecord[];
  additionalSummary?: Readonly<Record<string, unknown>>;
}): string {
  const summary = JSON.stringify({
    sourceFingerprint: input.sourceFingerprint,
    defaults: input.defaults,
    createdCategoryValues: input.newCategoryValues.length,
    restoredCategoryValues: input.restoredCategoryValues.length,
    classificationAudit: input.classificationAudit,
    ...input.additionalSummary,
  });
  if (summary.length > 100_000) {
    throw new Error(
      'The classification audit is too large for one Import History record. Split the source into smaller imports.',
    );
  }
  return summary;
}
