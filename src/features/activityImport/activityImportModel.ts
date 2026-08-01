import {
  categoryAssignmentSchema,
  categoryValueSchema,
  libraryCatalogItemSchema,
  type CategoryAssignment,
  type CategoryFamilyId,
  type CategoryValue,
  type LibraryActivityFields,
  type LibraryActivityGrouping,
  type LibraryCatalogItem,
  type LibraryCatalogStatus,
} from '@/domain/models/entities';
import { normalizeCategoryName } from '@/features/categories/categoryNormalization';
import {
  buildImportPreview,
  stableImportFingerprint,
  type ImportPreview,
  type ImportPreviewRow,
} from '@/features/importCenter/importPreviewModel';
import {
  createEmptyImportColumnMapping,
  mappedImportValue,
  normalizeImportText,
  suggestImportColumnMapping,
  type ImportColumnMapping,
  type ImportHeaderAliases,
  type ImportTable,
  type ImportTableRow,
} from '@/features/importCenter/importTableModel';

export const MAX_ACTIVITY_IMPORT_ROWS = 5_000;

export const activityImportFieldKeys = [
  'externalKey',
  'title',
  'description',
  'activityType',
  'purpose',
  'subject',
  'skill',
  'gradeLevel',
  'languageLevel',
  'durationMinutes',
  'grouping',
  'preparation',
  'materials',
  'instructions',
  'teacherLanguage',
  'differentiation',
  'variations',
  'assessmentOpportunity',
  'tags',
  'externalSource',
  'sourceReference',
  'status',
  'notes',
] as const;

export type ActivityImportFieldKey = (typeof activityImportFieldKeys)[number];
export type ActivityImportColumnMapping = ImportColumnMapping<ActivityImportFieldKey>;

export const activityImportFieldLabels: Record<ActivityImportFieldKey, string> = {
  externalKey: 'Activity ID / external key',
  title: 'Title',
  description: 'Description',
  activityType: 'Activity type',
  purpose: 'Purpose',
  subject: 'Subject',
  skill: 'Skill / focus',
  gradeLevel: 'Grade level',
  languageLevel: 'Language level',
  durationMinutes: 'Duration minutes',
  grouping: 'Grouping',
  preparation: 'Preparation',
  materials: 'Materials',
  instructions: 'Steps / instructions',
  teacherLanguage: 'Teacher language',
  differentiation: 'Differentiation',
  variations: 'Variations',
  assessmentOpportunity: 'Assessment opportunity',
  tags: 'Tags',
  externalSource: 'External source namespace',
  sourceReference: 'Source reference',
  status: 'Status',
  notes: 'Notes',
};

const aliases: ImportHeaderAliases<ActivityImportFieldKey> = {
  externalKey: ['activityid', 'externalkey', 'activitykey', 'catalogid', 'id'],
  title: ['title', 'activitytitle', 'name'],
  description: ['description', 'summary', 'overview'],
  activityType: ['activitytype', 'type', 'activitykind'],
  purpose: ['purpose', 'purposes', 'purposetag', 'purposetags'],
  subject: ['subject', 'subjects', 'contentarea'],
  skill: ['skill', 'skills', 'focus', 'focustag', 'focustags'],
  gradeLevel: ['gradelevel', 'grade', 'grades'],
  languageLevel: ['languagelevel', 'proficiencylevel', 'clalevel'],
  durationMinutes: ['durationminutes', 'duration', 'minutes', 'estimatedminutes'],
  grouping: ['grouping', 'group', 'groupingtype'],
  preparation: ['preparation', 'prep', 'teacherpreparation'],
  materials: ['materials', 'material', 'supplies'],
  instructions: ['steps', 'instructions', 'directions', 'procedure', 'procedures'],
  teacherLanguage: ['teacherlanguage', 'teacherprompt', 'teacherprompts'],
  differentiation: ['differentiation', 'scaffolds', 'supports'],
  variations: ['variations', 'variation', 'extensions'],
  assessmentOpportunity: [
    'assessmentopportunity',
    'assessment',
    'checkforunderstanding',
    'evidenceopportunity',
  ],
  tags: ['tags', 'tag', 'keywords', 'labels'],
  externalSource: ['externalsource', 'sourceorganization', 'organization', 'catalog', 'publisher'],
  sourceReference: ['source', 'sourcereference', 'reference', 'url', 'sourceurl'],
  status: ['status', 'lifecycle', 'state'],
  notes: ['notes', 'note', 'importnotes'],
};

export function createEmptyActivityImportMapping(): ActivityImportColumnMapping {
  return createEmptyImportColumnMapping(activityImportFieldKeys);
}

export function suggestActivityImportMapping(
  headers: readonly string[],
): ActivityImportColumnMapping {
  return suggestImportColumnMapping(headers, activityImportFieldKeys, aliases);
}

export type UnmappedColumnDecision = 'notes' | 'ignore';
export type UnmappedColumnDecisions = Record<number, UnmappedColumnDecision | undefined>;

export interface ReviewableUnmappedColumn {
  column: number;
  header: string;
  nonEmptyCount: number;
}

export function listReviewableUnmappedColumns(
  table: ImportTable,
  mapping: ActivityImportColumnMapping,
): ReviewableUnmappedColumn[] {
  const mapped = new Set(
    activityImportFieldKeys
      .map((key) => mapping[key])
      .filter((column): column is number => column !== null),
  );
  return table.headers
    .map((header, column) => ({
      column,
      header,
      nonEmptyCount: table.rows.filter((row) => normalizeImportText(row.values[column] ?? ''))
        .length,
    }))
    .filter((column) => !mapped.has(column.column) && column.nonEmptyCount > 0);
}

export interface ActivityImportDefaults {
  externalSource?: string;
  sourceReference?: string;
}

export type ActivityDuplicateDecision =
  | { action: 'create' }
  | { action: 'skip' }
  | { action: 'update'; targetId: string }
  | { action: 'update-archived'; targetId: string }
  | { action: 'restore-update'; targetId: string };

export type ActivityDuplicateDecisions = Record<number, ActivityDuplicateDecision | undefined>;

export type ActivityCategoryDecision =
  | { action: 'use'; categoryValueId: string }
  | { action: 'restore'; categoryValueId: string }
  | { action: 'create' }
  | { action: 'generic-tag' }
  | { action: 'ignore' };

export type ActivityCategoryDecisions = Record<string, ActivityCategoryDecision | undefined>;

export interface ActivityDuplicateCandidate {
  id: string;
  title: string;
  status: LibraryCatalogStatus;
  externalSource?: string;
  externalKey?: string;
  match: 'identity' | 'title' | 'source-and-title';
}

export interface ActivityDuplicateReview {
  kind: 'missing-source' | 'archived-identity' | 'probable-duplicate';
  message: string;
  candidates: ActivityDuplicateCandidate[];
}

export interface ActivityCategoryReview {
  key: string;
  familyId: Extract<CategoryFamilyId, 'purpose-tag' | 'focus-tag'>;
  displayValue: string;
  normalizedValue: string;
  kind: 'unknown' | 'archived' | 'merged';
  matchedValue?: CategoryValue;
  replacementValue?: CategoryValue;
}

export interface NormalizedActivityImportRow {
  sourceRow: number;
  externalKey?: string;
  externalSource?: string;
  sourceReference?: string;
  importIdentityKey?: string;
  title: string;
  description?: string;
  activityType?: string;
  purposeValues: string[];
  focusValues: string[];
  subject?: string;
  gradeLevel?: string;
  languageLevel?: string;
  durationMinutes?: number;
  grouping?: LibraryActivityGrouping;
  preparation?: string;
  materials?: string;
  instructions?: string;
  teacherLanguage?: string;
  differentiation?: string;
  variations?: string;
  assessmentOpportunity?: string;
  tags: string[];
  status?: LibraryCatalogStatus;
  notes?: string;
  presentFields: ActivityImportFieldKey[];
  unmappedValues: Array<{ header: string; value: string }>;
  validationErrors: string[];
}

export interface PlannedActivityCategoryAssignment {
  record: CategoryAssignment;
}

export interface PlannedActivityImportRow {
  normalized: NormalizedActivityImportRow;
  item?: LibraryCatalogItem;
  existingItem?: LibraryCatalogItem;
  expectedAssignments: CategoryAssignment[];
  assignmentsToCreate: PlannedActivityCategoryAssignment[];
  categoryValueIds: string[];
  duplicateReview?: ActivityDuplicateReview;
  categoryReviews: ActivityCategoryReview[];
}

export interface ActivityImportPreviewRow extends ImportPreviewRow<PlannedActivityImportRow> {
  normalized: NormalizedActivityImportRow;
  duplicateReview?: ActivityDuplicateReview;
  categoryReviews: ActivityCategoryReview[];
}

export interface ActivityImportPreview extends Omit<
  ImportPreview<PlannedActivityImportRow>,
  'rows'
> {
  importRunId: string;
  rows: ActivityImportPreviewRow[];
  defaults: ActivityImportDefaults;
  newCategoryValues: CategoryValue[];
  restoredCategoryValues: Array<{ before: CategoryValue; after: CategoryValue }>;
  expectedCategoryValues: CategoryValue[];
  categoryReviews: ActivityCategoryReview[];
}

export interface BuildActivityImportPreviewInput {
  table: ImportTable;
  mapping: ActivityImportColumnMapping;
  defaults: ActivityImportDefaults;
  unmappedDecisions: UnmappedColumnDecisions;
  duplicateDecisions: ActivityDuplicateDecisions;
  categoryDecisions: ActivityCategoryDecisions;
  existingItems: readonly LibraryCatalogItem[];
  categoryValues: readonly CategoryValue[];
  categoryAssignments: readonly CategoryAssignment[];
}

export interface ActivityImportPreviewDependencies {
  createId?: () => string;
  now?: () => string;
}

function optional(value: string): string | undefined {
  return value || undefined;
}

function normalizeIdentityPart(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function buildActivityImportIdentity(externalSource: string, externalKey: string): string {
  return `activity\u0000${normalizeIdentityPart(externalSource)}\u0000${normalizeIdentityPart(externalKey)}`;
}

export function normalizeActivityTitle(value: string): string {
  return normalizeIdentityPart(value);
}

function splitControlledValues(value: string): string[] {
  const unique = new Map<string, string>();
  for (const entry of value.split(/[\n;|]+/)) {
    const display = normalizeImportText(entry);
    if (!display) continue;
    const normalized = normalizeCategoryName(display);
    if (!unique.has(normalized)) unique.set(normalized, display);
  }
  return [...unique.values()];
}

function splitTags(value: string): string[] {
  const unique = new Map<string, string>();
  for (const entry of value.split(/[\n,;|]+/)) {
    const display = normalizeImportText(entry);
    if (!display) continue;
    const key = display.toLocaleLowerCase('en-US');
    if (!unique.has(key)) unique.set(key, display);
  }
  return [...unique.values()];
}

function addUniqueTag(target: Map<string, string>, value: string | undefined): void {
  const display = value ? normalizeImportText(value) : '';
  if (!display) return;
  const key = display.toLocaleLowerCase('en-US');
  if (!target.has(key)) target.set(key, display);
}

function parseGrouping(value: string): { value?: LibraryActivityGrouping; error?: string } {
  if (!value) return {};
  const normalized = normalizeIdentityPart(value).replace(/[_–—]+/g, '-');
  const compact = normalized.replace(/[^a-z]/g, '');
  const mapping: Record<string, LibraryActivityGrouping> = {
    wholeclass: 'whole-class',
    class: 'whole-class',
    smallgroup: 'small-group',
    group: 'small-group',
    partners: 'partners',
    partner: 'partners',
    pairs: 'partners',
    pair: 'partners',
    individual: 'individual',
    independent: 'individual',
    flexible: 'flexible',
    mixed: 'flexible',
  };
  const parsed = mapping[compact];
  return parsed ? { value: parsed } : { error: `Unknown grouping “${value}”.` };
}

function parseDuration(value: string): { value?: number; error?: string } {
  if (!value) return {};
  if (!/^\d+$/.test(value)) return { error: `Duration “${value}” must be a whole number.` };
  const parsed = Number(value);
  if (parsed < 1 || parsed > 1440) {
    return { error: 'Duration must be between 1 and 1,440 minutes.' };
  }
  return { value: parsed };
}

function parseStatus(value: string): { value?: LibraryCatalogStatus; error?: string } {
  if (!value) return {};
  const normalized = normalizeIdentityPart(value);
  if (['active', 'current', 'published'].includes(normalized)) return { value: 'active' };
  if (['archived', 'archive', 'inactive'].includes(normalized)) return { value: 'archived' };
  return { error: `Unknown status “${value}”.` };
}

function composeNotes(
  values: Array<[string, string | undefined]>,
  unmapped: Array<{ header: string; value: string }>,
): string | undefined {
  const sections: string[] = [];
  for (const [label, value] of values) {
    if (value) sections.push(`${label}\n${value}`);
  }
  for (const value of unmapped) sections.push(`Imported column: ${value.header}\n${value.value}`);
  return sections.length > 0 ? sections.join('\n\n') : undefined;
}

function valueFor(
  row: ImportTableRow,
  mapping: ActivityImportColumnMapping,
  key: ActivityImportFieldKey,
): string {
  return mappedImportValue(row, mapping, key);
}

function normalizeRow(
  row: ImportTableRow,
  table: ImportTable,
  mapping: ActivityImportColumnMapping,
  defaults: ActivityImportDefaults,
  unmappedDecisions: UnmappedColumnDecisions,
): NormalizedActivityImportRow {
  const validationErrors: string[] = [];
  const duration = parseDuration(valueFor(row, mapping, 'durationMinutes'));
  const grouping = parseGrouping(valueFor(row, mapping, 'grouping'));
  const status = parseStatus(valueFor(row, mapping, 'status'));
  if (duration.error) validationErrors.push(duration.error);
  if (grouping.error) validationErrors.push(grouping.error);
  if (status.error) validationErrors.push(status.error);

  const externalKey = optional(valueFor(row, mapping, 'externalKey'));
  const externalSource = optional(
    valueFor(row, mapping, 'externalSource') || normalizeImportText(defaults.externalSource ?? ''),
  );
  const sourceReference = optional(
    valueFor(row, mapping, 'sourceReference') ||
      normalizeImportText(defaults.sourceReference ?? ''),
  );
  const title = valueFor(row, mapping, 'title');
  const unmappedValues = listReviewableUnmappedColumns(table, mapping)
    .filter((column) => unmappedDecisions[column.column] === 'notes')
    .map((column) => ({
      header: column.header,
      value: normalizeImportText(row.values[column.column] ?? ''),
    }))
    .filter((value) => value.value);

  const preparation = optional(valueFor(row, mapping, 'preparation'));
  const teacherLanguage = optional(valueFor(row, mapping, 'teacherLanguage'));
  const differentiation = optional(valueFor(row, mapping, 'differentiation'));
  const variations = optional(valueFor(row, mapping, 'variations'));
  const assessmentOpportunity = optional(valueFor(row, mapping, 'assessmentOpportunity'));
  const activityType = optional(valueFor(row, mapping, 'activityType'));
  const importedNotes = optional(valueFor(row, mapping, 'notes'));
  const notes = composeNotes(
    [
      ['Activity type', activityType],
      ['Preparation', preparation],
      ['Teacher language', teacherLanguage],
      ['Differentiation', differentiation],
      ['Variations', variations],
      ['Assessment opportunity', assessmentOpportunity],
      ['Imported notes', importedNotes],
    ],
    unmappedValues,
  );

  const subject = optional(valueFor(row, mapping, 'subject'));
  const gradeLevel = optional(valueFor(row, mapping, 'gradeLevel'));
  const languageLevel = optional(valueFor(row, mapping, 'languageLevel'));
  const tagMap = new Map<string, string>();
  for (const tag of splitTags(valueFor(row, mapping, 'tags'))) addUniqueTag(tagMap, tag);
  if (subject) addUniqueTag(tagMap, `Subject: ${subject}`);
  if (gradeLevel) addUniqueTag(tagMap, `Grade: ${gradeLevel}`);
  if (languageLevel) addUniqueTag(tagMap, `Language level: ${languageLevel}`);

  const presentFields = activityImportFieldKeys.filter((key) => mapping[key] !== null);
  if (!title) validationErrors.push('Title is required.');
  if (title.length > 240) validationErrors.push('Title exceeds 240 characters.');
  const description = optional(valueFor(row, mapping, 'description'));
  const materials = optional(valueFor(row, mapping, 'materials'));
  const instructions = optional(valueFor(row, mapping, 'instructions'));
  if (description && description.length > 5000)
    validationErrors.push('Description exceeds 5,000 characters.');
  if (materials && materials.length > 5000)
    validationErrors.push('Materials exceed 5,000 characters.');
  if (instructions && instructions.length > 5000)
    validationErrors.push('Instructions exceed 5,000 characters.');
  if (notes && notes.length > 10000)
    validationErrors.push('Teacher notes exceed 10,000 characters.');
  if (externalKey && externalKey.length > 500)
    validationErrors.push('Activity ID exceeds 500 characters.');
  if (externalSource && externalSource.length > 500)
    validationErrors.push('External source exceeds 500 characters.');
  if (sourceReference && sourceReference.length > 2000)
    validationErrors.push('Source reference exceeds 2,000 characters.');
  for (const tag of tagMap.values()) {
    if (tag.length > 80) validationErrors.push(`Tag “${tag}” exceeds 80 characters.`);
  }
  if (tagMap.size > 30) validationErrors.push('This row contains more than 30 searchable tags.');

  const importIdentityKey =
    externalKey && externalSource
      ? buildActivityImportIdentity(externalSource, externalKey)
      : undefined;
  if (importIdentityKey && importIdentityKey.length > 1200) {
    validationErrors.push('The combined Activity import identity exceeds 1,200 characters.');
  }

  return {
    sourceRow: row.sourceRow,
    externalKey,
    externalSource,
    sourceReference,
    importIdentityKey,
    title,
    description,
    activityType,
    purposeValues: splitControlledValues(valueFor(row, mapping, 'purpose')),
    focusValues: splitControlledValues(valueFor(row, mapping, 'skill')),
    subject,
    gradeLevel,
    languageLevel,
    durationMinutes: duration.value,
    grouping: grouping.value,
    preparation,
    materials,
    instructions,
    teacherLanguage,
    differentiation,
    variations,
    assessmentOpportunity,
    tags: [...tagMap.values()],
    status: status.value,
    notes,
    presentFields,
    unmappedValues,
    validationErrors,
  };
}

function activityFields(item: LibraryCatalogItem | undefined): LibraryActivityFields {
  return item?.typedFields?.catalogType === 'activity'
    ? item.typedFields
    : { catalogType: 'activity', grouping: 'flexible' };
}

function comparableActivityRecord(item: LibraryCatalogItem): unknown {
  const comparable: Partial<LibraryCatalogItem> = { ...item };
  delete comparable.updatedAt;
  delete comparable.lastImportRunId;
  return comparable;
}

function sameRecord(first: LibraryCatalogItem, second: LibraryCatalogItem): boolean {
  return (
    stableImportFingerprint(comparableActivityRecord(first)) ===
    stableImportFingerprint(comparableActivityRecord(second))
  );
}

function mergeImportedNotes(
  existing: string | undefined,
  imported: string | undefined,
): string | undefined {
  if (!imported) return existing;
  if (!existing) return imported;
  if (existing.includes(imported)) return existing;
  return `${existing}\n\n${imported}`;
}

function compareAssignment(first: CategoryAssignment, second: CategoryAssignment): number {
  return first.id.localeCompare(second.id);
}

function categoryReviewKey(
  familyId: Extract<CategoryFamilyId, 'purpose-tag' | 'focus-tag'>,
  displayValue: string,
): string {
  return `${familyId}\u0000${normalizeCategoryName(displayValue)}`;
}

function duplicateCandidate(
  item: LibraryCatalogItem,
  match: ActivityDuplicateCandidate['match'],
): ActivityDuplicateCandidate {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    externalSource: item.externalSource,
    externalKey: item.externalKey,
    match,
  };
}

export function buildActivityImportPreview(
  input: BuildActivityImportPreviewInput,
  dependencies: ActivityImportPreviewDependencies = {},
): ActivityImportPreview {
  if (input.mapping.title === null) throw new Error('Map the Activity title before previewing.');
  if (input.table.rows.length === 0) throw new Error('The selected table contains no data rows.');
  if (input.table.rows.length > MAX_ACTIVITY_IMPORT_ROWS) {
    throw new Error(
      `Import no more than ${MAX_ACTIVITY_IMPORT_ROWS.toLocaleString('en-US')} Activities at a time.`,
    );
  }
  const unresolvedColumns = listReviewableUnmappedColumns(input.table, input.mapping).filter(
    (column) => !input.unmappedDecisions[column.column],
  );
  if (unresolvedColumns.length > 0) {
    throw new Error('Review every non-empty unmapped source column before generating preview.');
  }

  const createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
  const generatedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  const importRunId = createId();
  const existingActivities = input.existingItems.filter((item) => item.catalogType === 'activity');
  const byId = new Map(existingActivities.map((item) => [item.id, item] as const));
  const byIdentity = new Map(
    existingActivities
      .filter((item) => item.importIdentityKey)
      .map((item) => [item.importIdentityKey!, item] as const),
  );
  const byTitle = new Map<string, LibraryCatalogItem[]>();
  for (const item of existingActivities) {
    const key = normalizeActivityTitle(item.title);
    const values = byTitle.get(key) ?? [];
    values.push(item);
    byTitle.set(key, values);
  }
  const assignmentsByItem = new Map<string, CategoryAssignment[]>();
  for (const assignment of input.categoryAssignments) {
    if (
      assignment.entityType !== 'library-item' ||
      !['purpose-tag', 'focus-tag'].includes(assignment.familyId)
    ) {
      continue;
    }
    const values = assignmentsByItem.get(assignment.entityId) ?? [];
    values.push(categoryAssignmentSchema.parse(assignment));
    assignmentsByItem.set(assignment.entityId, values);
  }

  const values = input.categoryValues.map((value) => categoryValueSchema.parse(value));
  const valueById = new Map(values.map((value) => [value.id, value] as const));
  const valuesByFamily = new Map<CategoryFamilyId, CategoryValue[]>();
  for (const value of values) {
    const group = valuesByFamily.get(value.familyId) ?? [];
    group.push(value);
    valuesByFamily.set(value.familyId, group);
  }
  const nextSortOrder = new Map<CategoryFamilyId, number>();
  for (const familyId of ['purpose-tag', 'focus-tag'] as const) {
    nextSortOrder.set(
      familyId,
      Math.max(-1, ...(valuesByFamily.get(familyId) ?? []).map((value) => value.sortOrder)) + 1,
    );
  }

  const normalizedRows = input.table.rows.map((row) =>
    normalizeRow(row, input.table, input.mapping, input.defaults, input.unmappedDecisions),
  );
  const identityGroups = new Map<string, NormalizedActivityImportRow[]>();
  for (const row of normalizedRows) {
    if (!row.importIdentityKey) continue;
    const group = identityGroups.get(row.importIdentityKey) ?? [];
    group.push(row);
    identityGroups.set(row.importIdentityKey, group);
  }
  const conflictingIdentityRows = new Set<number>();
  const repeatedIdentityRows = new Set<number>();
  for (const group of identityGroups.values()) {
    if (group.length < 2) continue;
    const fingerprints = new Set(
      group.map((row) => stableImportFingerprint({ ...row, sourceRow: 0 })),
    );
    if (fingerprints.size > 1) {
      for (const row of group) conflictingIdentityRows.add(row.sourceRow);
    } else {
      for (const row of group.slice(1)) repeatedIdentityRows.add(row.sourceRow);
    }
  }

  const newCategoryByKey = new Map<string, CategoryValue>();
  const restoredCategoryById = new Map<string, { before: CategoryValue; after: CategoryValue }>();
  const expectedCategoryById = new Map<string, CategoryValue>();
  const categoryReviewsByKey = new Map<string, ActivityCategoryReview>();

  function resolveCategories(
    familyId: Extract<CategoryFamilyId, 'purpose-tag' | 'focus-tag'>,
    displays: readonly string[],
  ): {
    ids: string[];
    genericTags: string[];
    reviews: ActivityCategoryReview[];
    reasons: string[];
  } {
    const ids: string[] = [];
    const genericTags: string[] = [];
    const reviews: ActivityCategoryReview[] = [];
    const reasons: string[] = [];
    const familyValues = valuesByFamily.get(familyId) ?? [];

    for (const displayValue of displays) {
      const normalizedValue = normalizeCategoryName(displayValue);
      const exact = familyValues.find((value) => value.normalizedName === normalizedValue);
      const alias = familyValues.find((value) => value.normalizedAliases.includes(normalizedValue));
      const matched = exact ?? alias;
      if (matched?.lifecycleState === 'active') {
        ids.push(matched.id);
        expectedCategoryById.set(matched.id, matched);
        continue;
      }
      const replacement =
        matched?.lifecycleState === 'merged' && matched.mergedIntoId
          ? valueById.get(matched.mergedIntoId)
          : undefined;
      const key = categoryReviewKey(familyId, displayValue);
      const review: ActivityCategoryReview = {
        key,
        familyId,
        displayValue,
        normalizedValue,
        kind:
          matched?.lifecycleState === 'archived'
            ? 'archived'
            : matched?.lifecycleState === 'merged'
              ? 'merged'
              : 'unknown',
        matchedValue: matched,
        replacementValue: replacement,
      };
      categoryReviewsByKey.set(key, review);
      const decision = input.categoryDecisions[key];
      if (!decision) {
        reviews.push(review);
        reasons.push(
          `Review ${familyId === 'purpose-tag' ? 'Purpose' : 'Focus'} value “${displayValue}”.`,
        );
        continue;
      }
      if (decision.action === 'ignore') continue;
      if (decision.action === 'generic-tag') {
        genericTags.push(`${familyId === 'purpose-tag' ? 'Purpose' : 'Focus'}: ${displayValue}`);
        continue;
      }
      if (decision.action === 'create') {
        let created = newCategoryByKey.get(key);
        if (!created) {
          const sortOrder = nextSortOrder.get(familyId) ?? 0;
          nextSortOrder.set(familyId, sortOrder + 1);
          created = categoryValueSchema.parse({
            id: createId(),
            familyId,
            name: displayValue,
            normalizedName: normalizedValue,
            aliases: [],
            normalizedAliases: [],
            sortOrder,
            isDefault: false,
            lifecycleState: 'active',
            createdAt: generatedAt,
            updatedAt: generatedAt,
          });
          newCategoryByKey.set(key, created);
        }
        ids.push(created.id);
        continue;
      }
      const selected = valueById.get(decision.categoryValueId);
      if (!selected || selected.familyId !== familyId) {
        reviews.push(review);
        reasons.push(`The selected category resolution for “${displayValue}” is no longer valid.`);
        continue;
      }
      if (decision.action === 'use') {
        if (selected.lifecycleState !== 'active') {
          reviews.push(review);
          reasons.push(`The selected category “${selected.name}” is not active.`);
          continue;
        }
        ids.push(selected.id);
        expectedCategoryById.set(selected.id, selected);
        continue;
      }
      if (selected.lifecycleState !== 'archived') {
        reviews.push(review);
        reasons.push(`Only an archived category can be restored for “${displayValue}”.`);
        continue;
      }
      let restored = restoredCategoryById.get(selected.id);
      if (!restored) {
        restored = {
          before: selected,
          after: categoryValueSchema.parse({
            ...selected,
            lifecycleState: 'active',
            archivedAt: undefined,
            updatedAt: generatedAt,
          }),
        };
        restoredCategoryById.set(selected.id, restored);
      }
      ids.push(selected.id);
      expectedCategoryById.set(selected.id, selected);
    }
    return { ids: [...new Set(ids)], genericTags, reviews, reasons };
  }

  const rows: ActivityImportPreviewRow[] = [];
  for (const normalized of normalizedRows) {
    const baseReasons = [...normalized.validationErrors];
    if (conflictingIdentityRows.has(normalized.sourceRow)) {
      baseReasons.push('This source contains conflicting rows with the same Activity identity.');
    }
    if (baseReasons.length > 0) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: baseReasons,
        normalized,
        categoryReviews: [],
      });
      continue;
    }
    if (repeatedIdentityRows.has(normalized.sourceRow)) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'skip',
        reasons: ['This is an exact repeated Activity identity in the same source.'],
        normalized,
        categoryReviews: [],
      });
      continue;
    }

    const exactIdentity = normalized.importIdentityKey
      ? byIdentity.get(normalized.importIdentityKey)
      : undefined;
    const titleMatches = byTitle.get(normalizeActivityTitle(normalized.title)) ?? [];
    const sourceAndTitleMatches = titleMatches.filter(
      (item) =>
        normalized.sourceReference &&
        item.sourceReference &&
        normalizeIdentityPart(item.sourceReference) ===
          normalizeIdentityPart(normalized.sourceReference),
    );
    let duplicateReview: ActivityDuplicateReview | undefined;
    let target = exactIdentity;
    let forcedAction: ActivityDuplicateDecision | undefined;

    if (exactIdentity?.status === 'archived') {
      duplicateReview = {
        kind: 'archived-identity',
        message: 'The stable Activity identity matches an archived Library record.',
        candidates: [duplicateCandidate(exactIdentity, 'identity')],
      };
    } else if (normalized.externalKey && !normalized.externalSource) {
      duplicateReview = {
        kind: 'missing-source',
        message:
          'Activity ID needs a reviewed external source namespace before it can be a stable identity.',
        candidates: titleMatches.map((item) => duplicateCandidate(item, 'title')),
      };
    } else if (!exactIdentity && titleMatches.length > 0) {
      duplicateReview = {
        kind: 'probable-duplicate',
        message:
          'Title equality is only a probable duplicate and never triggers automatic overwrite.',
        candidates: [
          ...sourceAndTitleMatches.map((item) => duplicateCandidate(item, 'source-and-title')),
          ...titleMatches
            .filter((item) => !sourceAndTitleMatches.some((match) => match.id === item.id))
            .map((item) => duplicateCandidate(item, 'title')),
        ],
      };
    }

    if (duplicateReview) {
      forcedAction = input.duplicateDecisions[normalized.sourceRow];
      if (!forcedAction) {
        rows.push({
          sourceRow: normalized.sourceRow,
          classification: 'review',
          reasons: [duplicateReview.message],
          normalized,
          duplicateReview,
          categoryReviews: [],
          planned: {
            normalized,
            existingItem: exactIdentity,
            expectedAssignments: exactIdentity
              ? [...(assignmentsByItem.get(exactIdentity.id) ?? [])].sort(compareAssignment)
              : [],
            assignmentsToCreate: [],
            categoryValueIds: [],
            duplicateReview,
            categoryReviews: [],
          },
        });
        continue;
      }
      if (forcedAction.action === 'skip') {
        rows.push({
          sourceRow: normalized.sourceRow,
          classification: 'skip',
          reasons: ['The reviewed row is intentionally skipped.'],
          normalized,
          duplicateReview,
          categoryReviews: [],
        });
        continue;
      }
      if (forcedAction.action === 'create') {
        target = undefined;
      } else {
        target = byId.get(forcedAction.targetId);
        if (!target) {
          rows.push({
            sourceRow: normalized.sourceRow,
            classification: 'review',
            reasons: ['The selected existing Activity is no longer available.'],
            normalized,
            duplicateReview,
            categoryReviews: [],
          });
          continue;
        }
        if (forcedAction.action === 'update' && target.status !== 'active') {
          rows.push({
            sourceRow: normalized.sourceRow,
            classification: 'review',
            reasons: ['Choose whether the archived Activity should stay archived or be restored.'],
            normalized,
            duplicateReview,
            categoryReviews: [],
          });
          continue;
        }
        if (
          (forcedAction.action === 'update-archived' || forcedAction.action === 'restore-update') &&
          target.status !== 'archived'
        ) {
          rows.push({
            sourceRow: normalized.sourceRow,
            classification: 'review',
            reasons: ['The selected Activity is no longer archived.'],
            normalized,
            duplicateReview,
            categoryReviews: [],
          });
          continue;
        }
      }
    }

    if (
      target?.importIdentityKey &&
      normalized.importIdentityKey &&
      target.importIdentityKey !== normalized.importIdentityKey
    ) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: ['The reviewed update target already has a different stable import identity.'],
        normalized,
        duplicateReview,
        categoryReviews: [],
      });
      continue;
    }
    if (
      normalized.importIdentityKey &&
      byIdentity.has(normalized.importIdentityKey) &&
      byIdentity.get(normalized.importIdentityKey)?.id !== target?.id
    ) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: ['The Activity import identity is already used by another Library record.'],
        normalized,
        duplicateReview,
        categoryReviews: [],
      });
      continue;
    }

    const purpose = resolveCategories('purpose-tag', normalized.purposeValues);
    const focus = resolveCategories('focus-tag', normalized.focusValues);
    const categoryReviews = [...purpose.reviews, ...focus.reviews];
    if (categoryReviews.length > 0) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'review',
        reasons: [...purpose.reasons, ...focus.reasons],
        normalized,
        duplicateReview,
        categoryReviews,
        planned: {
          normalized,
          existingItem: target,
          expectedAssignments: target
            ? [...(assignmentsByItem.get(target.id) ?? [])].sort(compareAssignment)
            : [],
          assignmentsToCreate: [],
          categoryValueIds: [],
          duplicateReview,
          categoryReviews,
        },
      });
      continue;
    }

    const existingTags = new Map<string, string>();
    for (const tag of target?.tags ?? []) addUniqueTag(existingTags, tag);
    for (const tag of normalized.tags) addUniqueTag(existingTags, tag);
    for (const tag of [...purpose.genericTags, ...focus.genericTags])
      addUniqueTag(existingTags, tag);
    const mergedTags = [...existingTags.values()];
    if (mergedTags.length > 30 || mergedTags.some((tag) => tag.length > 80)) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: [
          'The reviewed update would exceed the Library limit of 30 tags at 80 characters each.',
        ],
        normalized,
        duplicateReview,
        categoryReviews: [],
      });
      continue;
    }

    let externalKey = normalized.externalKey;
    let externalSource = normalized.externalSource;
    let importIdentityKey = normalized.importIdentityKey;
    let notes = normalized.notes;
    if (normalized.externalKey && !normalized.externalSource && forcedAction?.action === 'create') {
      notes = composeNotes(
        [
          ['Legacy activity ID', normalized.externalKey],
          ['Teacher notes', notes],
        ],
        [],
      );
      externalKey = undefined;
      externalSource = undefined;
      importIdentityKey = undefined;
    }

    const existingFields = activityFields(target);
    let status = normalized.status ?? target?.status ?? 'active';
    if (forcedAction?.action === 'restore-update') status = 'active';
    if (forcedAction?.action === 'update-archived') status = 'archived';
    const itemId = target?.id ?? createId();
    const withoutRun = libraryCatalogItemSchema.parse({
      id: itemId,
      catalogType: 'activity',
      title: normalized.title,
      description: normalized.description ?? target?.description,
      tags: mergedTags,
      typedFields: {
        catalogType: 'activity',
        grouping: normalized.grouping ?? existingFields.grouping,
        estimatedMinutes: normalized.durationMinutes ?? existingFields.estimatedMinutes,
        directions: normalized.instructions ?? existingFields.directions,
        materials: normalized.materials ?? existingFields.materials,
        notes: mergeImportedNotes(existingFields.notes, notes),
      },
      externalSource: externalSource ?? target?.externalSource,
      externalKey: externalKey ?? target?.externalKey,
      sourceReference: normalized.sourceReference ?? target?.sourceReference,
      importIdentityKey: importIdentityKey ?? target?.importIdentityKey,
      lastImportRunId: target?.lastImportRunId,
      status,
      createdAt: target?.createdAt ?? generatedAt,
      updatedAt: target ? generatedAt : generatedAt,
      archivedAt: status === 'archived' ? (target?.archivedAt ?? generatedAt) : undefined,
    });

    const desiredCategoryIds = [...new Set([...purpose.ids, ...focus.ids])];
    const expectedAssignments = target
      ? [...(assignmentsByItem.get(target.id) ?? [])].sort(compareAssignment)
      : [];
    const existingCategoryIds = new Set(
      expectedAssignments.map((assignment) => assignment.categoryValueId),
    );
    const assignmentsToCreate = desiredCategoryIds
      .filter((categoryValueId) => !existingCategoryIds.has(categoryValueId))
      .map((categoryValueId) => {
        const value =
          valueById.get(categoryValueId) ??
          [...newCategoryByKey.values()].find((candidate) => candidate.id === categoryValueId) ??
          restoredCategoryById.get(categoryValueId)?.after;
        if (!value) throw new Error('A reviewed Activity category value could not be resolved.');
        return {
          record: categoryAssignmentSchema.parse({
            id: createId(),
            familyId: value.familyId,
            categoryValueId,
            entityType: 'library-item',
            entityId: itemId,
            createdAt: generatedAt,
          }),
        };
      });

    const itemChanged = !target || !sameRecord(withoutRun, target);
    const hasCategoryChanges =
      assignmentsToCreate.length > 0 ||
      desiredCategoryIds.some(
        (categoryValueId) =>
          restoredCategoryById.has(categoryValueId) ||
          [...newCategoryByKey.values()].some((value) => value.id === categoryValueId),
      );
    if (target && !itemChanged && !hasCategoryChanges) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'skip',
        reasons: ['The stable Activity identity already has the same reviewed values.'],
        normalized,
        duplicateReview,
        categoryReviews: [],
        planned: {
          normalized,
          existingItem: target,
          expectedAssignments,
          assignmentsToCreate: [],
          categoryValueIds: desiredCategoryIds,
          duplicateReview,
          categoryReviews: [],
        },
      });
      continue;
    }

    const item = libraryCatalogItemSchema.parse({ ...withoutRun, lastImportRunId: importRunId });
    rows.push({
      sourceRow: normalized.sourceRow,
      classification: target ? 'update' : 'create',
      reasons: [
        target
          ? 'The reviewed stable identity or explicit duplicate decision updates this Activity.'
          : 'No strong existing identity was selected; create a new Activity.',
        ...(assignmentsToCreate.length > 0
          ? [`Add ${assignmentsToCreate.length} reviewed Purpose/Focus assignment(s).`]
          : []),
      ],
      normalized,
      duplicateReview,
      categoryReviews: [],
      planned: {
        normalized,
        item,
        existingItem: target,
        expectedAssignments,
        assignmentsToCreate,
        categoryValueIds: desiredCategoryIds,
        duplicateReview,
        categoryReviews: [],
      },
    });
  }

  const genericPreview = buildImportPreview(
    rows.map((row) => ({
      sourceRow: row.sourceRow,
      classification: row.classification,
      reasons: row.reasons,
      planned: row.planned,
    })),
    {
      table: input.table,
      mapping: input.mapping,
      defaults: input.defaults,
      unmappedDecisions: input.unmappedDecisions,
      duplicateDecisions: input.duplicateDecisions,
      categoryDecisions: input.categoryDecisions,
    },
    generatedAt,
  );

  return {
    ...genericPreview,
    importRunId,
    rows,
    defaults: {
      externalSource: optional(normalizeImportText(input.defaults.externalSource ?? '')),
      sourceReference: optional(normalizeImportText(input.defaults.sourceReference ?? '')),
    },
    newCategoryValues: [...newCategoryByKey.values()],
    restoredCategoryValues: [...restoredCategoryById.values()],
    expectedCategoryValues: [...expectedCategoryById.values()],
    categoryReviews: [...categoryReviewsByKey.values()],
  };
}
