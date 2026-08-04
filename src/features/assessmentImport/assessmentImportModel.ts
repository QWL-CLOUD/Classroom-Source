import {
  categoryAssignmentSchema,
  libraryCatalogItemSchema,
  type CategoryAssignment,
  type CategoryValue,
  type LibraryAssessmentFields,
  type LibraryAssessmentKind,
  type LibraryCatalogItem,
  type LibraryCatalogStatus,
} from '@/domain/models/entities';
import {
  buildImportPreview,
  stableImportFingerprint,
  type ImportPreview,
  type ImportPreviewRow,
} from '@/features/importCenter/importPreviewModel';
import {
  createImportClassificationResolutionSession,
  planImportClassificationAssignments,
  type ImportClassificationAuditRecord,
  type ImportClassificationDecisions,
  type ImportClassificationReview,
} from '@/features/importCenter/importClassificationResolution';
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

export const MAX_ASSESSMENT_IMPORT_ROWS = 5_000;

export const assessmentImportFieldKeys = [
  'externalKey',
  'title',
  'description',
  'assessmentKind',
  'studentPrompt',
  'evidenceToCollect',
  'subject',
  'gradeLevel',
  'language',
  'languageLevel',
  'purpose',
  'skill',
  'relatedUnit',
  'tags',
  'externalSource',
  'sourceReference',
  'status',
  'notes',
] as const;

export type AssessmentImportFieldKey = (typeof assessmentImportFieldKeys)[number];
export type AssessmentImportColumnMapping = ImportColumnMapping<AssessmentImportFieldKey>;

export const assessmentImportFieldLabels: Record<AssessmentImportFieldKey, string> = {
  externalKey: 'Assessment ID / external key',
  title: 'Title',
  description: 'Description',
  assessmentKind: 'Assessment kind',
  studentPrompt: 'Student prompt',
  evidenceToCollect: 'Evidence to collect',
  subject: 'Subject',
  gradeLevel: 'Grade level',
  language: 'Language',
  languageLevel: 'Language level',
  purpose: 'Purpose',
  skill: 'Skill / focus',
  relatedUnit: 'Related unit',
  tags: 'Tags',
  externalSource: 'External source namespace',
  sourceReference: 'Source reference',
  status: 'Status',
  notes: 'Notes',
};

const aliases: ImportHeaderAliases<AssessmentImportFieldKey> = {
  externalKey: ['assessmentid', 'externalkey', 'assessmentkey', 'catalogid', 'id'],
  title: ['title', 'assessment', 'assessmentname', 'name'],
  description: ['description', 'overview'],
  assessmentKind: ['assessmentkind', 'assessmenttype', 'kind', 'type'],
  studentPrompt: ['studentprompt', 'prompt', 'question', 'task', 'instructions', 'directions'],
  evidenceToCollect: [
    'evidencetocollect',
    'evidence',
    'evidencemethod',
    'lookfors',
    'successcriteria',
  ],
  subject: ['subject', 'domain', 'contentarea'],
  gradeLevel: ['gradelevel', 'grade'],
  language: ['language', 'languages', 'instructionallanguage', 'targetlanguage'],
  languageLevel: ['languagelevel', 'proficiencylevel', 'level'],
  purpose: ['purpose', 'purposes', 'purposetag', 'purposetags'],
  skill: ['skill', 'skills', 'focus', 'focustag', 'focustags'],
  relatedUnit: ['relatedunit', 'unit', 'module'],
  tags: ['tags', 'tag', 'keywords', 'labels'],
  externalSource: ['externalsource', 'organization', 'publisher', 'catalog'],
  sourceReference: ['sourcereference', 'source', 'citation', 'provenance'],
  status: ['status', 'state', 'lifecycle'],
  notes: ['notes', 'note', 'teachernotes', 'importnotes'],
};

export function createEmptyAssessmentImportMapping(): AssessmentImportColumnMapping {
  return createEmptyImportColumnMapping(assessmentImportFieldKeys);
}

export function suggestAssessmentImportMapping(
  headers: readonly string[],
): AssessmentImportColumnMapping {
  return suggestImportColumnMapping(headers, assessmentImportFieldKeys, aliases);
}

export type UnmappedColumnDecision = 'notes' | 'ignore';
export type UnmappedColumnDecisions = Record<number, UnmappedColumnDecision | undefined>;

export interface ReviewableUnmappedColumn {
  column: number;
  header: string;
  nonEmptyCount: number;
}

export function listReviewableAssessmentUnmappedColumns(
  table: ImportTable,
  mapping: AssessmentImportColumnMapping,
): ReviewableUnmappedColumn[] {
  const mapped = new Set(
    assessmentImportFieldKeys
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

export interface AssessmentImportDefaults {
  externalSource?: string;
  sourceReference?: string;
  assessmentKind?: LibraryAssessmentKind;
}

export type AssessmentDuplicateDecision =
  | { action: 'create' }
  | { action: 'skip' }
  | { action: 'update'; targetId: string }
  | { action: 'update-archived'; targetId: string }
  | { action: 'restore-update'; targetId: string };

export type AssessmentDuplicateDecisions = Record<number, AssessmentDuplicateDecision | undefined>;

export type AssessmentKindDecision = { action: 'use'; kind: LibraryAssessmentKind };
export type AssessmentKindDecisions = Record<number, AssessmentKindDecision | undefined>;

export interface AssessmentDuplicateCandidate {
  id: string;
  title: string;
  status: LibraryCatalogStatus;
  externalSource?: string;
  externalKey?: string;
  match: 'identity' | 'title' | 'title-and-prompt';
}

export interface AssessmentDuplicateReview {
  kind: 'missing-source' | 'archived-identity' | 'probable-duplicate';
  message: string;
  candidates: AssessmentDuplicateCandidate[];
}

export interface AssessmentKindReview {
  rawValue?: string;
  message: string;
}

export interface NormalizedAssessmentImportRow {
  sourceRow: number;
  externalKey?: string;
  externalSource?: string;
  sourceReference?: string;
  importIdentityKey?: string;
  title: string;
  description?: string;
  rawAssessmentKind?: string;
  assessmentKind?: LibraryAssessmentKind;
  studentPrompt?: string;
  evidenceToCollect?: string;
  subject?: string;
  gradeLevel?: string;
  language?: string;
  languageLevel?: string;
  purpose?: string;
  skill?: string;
  relatedUnit?: string;
  tags: string[];
  status?: LibraryCatalogStatus;
  notes?: string;
  presentFields: AssessmentImportFieldKey[];
  unmappedValues: Array<{ header: string; value: string }>;
  validationErrors: string[];
}

export interface PlannedAssessmentImportRow {
  item?: LibraryCatalogItem;
  existingItem?: LibraryCatalogItem;
  expectedAssignments: CategoryAssignment[];
  assignmentsToDelete: CategoryAssignment[];
  assignmentsToCreate: CategoryAssignment[];
  categoryValueIds: string[];
  classificationReviews?: ImportClassificationReview[];
}

export interface AssessmentImportPreviewRow extends ImportPreviewRow<PlannedAssessmentImportRow> {
  normalized: NormalizedAssessmentImportRow;
  duplicateReview?: AssessmentDuplicateReview;
  kindReview?: AssessmentKindReview;
  classificationReviews?: ImportClassificationReview[];
}

export interface AssessmentImportPreview extends Omit<
  ImportPreview<PlannedAssessmentImportRow>,
  'rows'
> {
  importRunId: string;
  rows: AssessmentImportPreviewRow[];
  defaults: AssessmentImportDefaults;
  newCategoryValues: CategoryValue[];
  restoredCategoryValues: Array<{ before: CategoryValue; after: CategoryValue }>;
  expectedCategoryValues: CategoryValue[];
  classificationReviews: ImportClassificationReview[];
  classificationAudit: ImportClassificationAuditRecord[];
}

export interface BuildAssessmentImportPreviewInput {
  table: ImportTable;
  mapping: AssessmentImportColumnMapping;
  defaults: AssessmentImportDefaults;
  unmappedDecisions: UnmappedColumnDecisions;
  duplicateDecisions: AssessmentDuplicateDecisions;
  kindDecisions: AssessmentKindDecisions;
  classificationDecisions?: ImportClassificationDecisions;
  existingItems: LibraryCatalogItem[];
  categoryValues?: readonly CategoryValue[];
  categoryAssignments?: readonly CategoryAssignment[];
}

export interface AssessmentImportPreviewDependencies {
  createId?: () => string;
  now?: () => string;
}

const kindAliases: Record<string, LibraryAssessmentKind> = {
  diagnostic: 'diagnostic',
  preassessment: 'diagnostic',
  pretest: 'diagnostic',
  formative: 'formative',
  formativeassessment: 'formative',
  ongoingassessment: 'formative',
  summative: 'summative',
  summativeassessment: 'summative',
  finalassessment: 'summative',
  selfassessment: 'self-assessment',
  selfevaluation: 'self-assessment',
  other: 'other',
};

function normalizeToken(value: string): string {
  return normalizeImportText(value)
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizedTitle(value: string): string {
  return normalizeImportText(value).toLocaleLowerCase('en');
}

function normalizedPrompt(value: string | undefined): string {
  return normalizeImportText(value ?? '').toLocaleLowerCase('en');
}

function splitValues(value: string): string[] {
  return normalizeImportText(value)
    .split(/[;|,\n]+/)
    .map((entry) => normalizeImportText(entry))
    .filter(Boolean);
}

function uniqueTags(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = normalizeImportText(value);
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase('en');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function tagged(label: string, value: string | undefined): string | undefined {
  const normalized = normalizeImportText(value ?? '');
  return normalized ? `${label}: ${normalized}` : undefined;
}

function optional(value: string): string | undefined {
  const normalized = normalizeImportText(value);
  return normalized || undefined;
}

function parseStatus(value: string): LibraryCatalogStatus | undefined {
  const token = normalizeToken(value);
  if (!token) return undefined;
  if (token === 'active' || token === 'current') return 'active';
  if (token === 'archived' || token === 'inactive') return 'archived';
  return undefined;
}

function resolveKind(raw: string): LibraryAssessmentKind | undefined {
  return kindAliases[normalizeToken(raw)];
}

function composeDescription(
  description: string | undefined,
  notes: string | undefined,
  unmappedValues: readonly { header: string; value: string }[],
): string | undefined {
  const sections: string[] = [];
  if (description) sections.push(description);
  if (notes) sections.push(`Imported notes\n${notes}`);
  if (unmappedValues.length) {
    sections.push(
      `Preserved source columns\n${unmappedValues
        .map((entry) => `${entry.header}: ${entry.value}`)
        .join('\n')}`,
    );
  }
  return sections.join('\n\n') || undefined;
}

function normalizeRow(
  row: ImportTableRow,
  table: ImportTable,
  mapping: AssessmentImportColumnMapping,
  defaults: AssessmentImportDefaults,
  unmappedDecisions: UnmappedColumnDecisions,
  kindDecision: AssessmentKindDecision | undefined,
): NormalizedAssessmentImportRow {
  const presentFields = assessmentImportFieldKeys.filter((key) => {
    const column = mapping[key];
    return column !== null && column < row.values.length;
  });
  const get = (key: AssessmentImportFieldKey) => mappedImportValue(row, mapping, key);
  const unmappedValues = table.headers
    .map((header, column) => ({
      header,
      value: normalizeImportText(row.values[column] ?? ''),
      column,
    }))
    .filter((entry) => entry.value && unmappedDecisions[entry.column] === 'notes')
    .map(({ header, value }) => ({ header, value }));

  const rawAssessmentKind = optional(get('assessmentKind'));
  const assessmentKind =
    kindDecision?.kind ??
    (rawAssessmentKind ? resolveKind(rawAssessmentKind) : defaults.assessmentKind);
  const rawStatus = get('status');
  const status = parseStatus(rawStatus);
  const externalKey = optional(get('externalKey'));
  const externalSource = optional(get('externalSource')) ?? optional(defaults.externalSource ?? '');
  const sourceReference =
    optional(get('sourceReference')) ?? optional(defaults.sourceReference ?? '');
  const description = composeDescription(
    optional(get('description')),
    optional(get('notes')),
    unmappedValues,
  );
  const tags = uniqueTags([...splitValues(get('tags')), tagged('Unit', get('relatedUnit')) ?? '']);
  const validationErrors: string[] = [];
  const title = normalizeImportText(get('title'));
  if (!title) validationErrors.push('Title is required.');
  if (title.length > 240) validationErrors.push('Title exceeds 240 characters.');
  if (description && description.length > 5_000) {
    validationErrors.push('Description and preserved notes exceed 5,000 characters.');
  }
  const studentPrompt = optional(get('studentPrompt'));
  const evidenceToCollect = optional(get('evidenceToCollect'));
  if (studentPrompt && studentPrompt.length > 5_000) {
    validationErrors.push('Student prompt exceeds 5,000 characters.');
  }
  if (evidenceToCollect && evidenceToCollect.length > 5_000) {
    validationErrors.push('Evidence to collect exceeds 5,000 characters.');
  }
  if (tags.length > 30) validationErrors.push('Tags exceed the 30-tag limit.');
  if (tags.some((tag) => tag.length > 80)) {
    validationErrors.push('One or more tags exceed 80 characters.');
  }
  if (rawStatus && !status) validationErrors.push(`Status "${rawStatus}" is not supported.`);
  const rawKindValues = rawAssessmentKind ? splitValues(rawAssessmentKind) : [];
  if (rawKindValues.length > 1) {
    validationErrors.push('Assessment Kind must contain only one value.');
  }

  return {
    sourceRow: row.sourceRow,
    externalKey,
    externalSource,
    sourceReference,
    importIdentityKey:
      externalSource && externalKey
        ? buildAssessmentImportIdentity(externalSource, externalKey)
        : undefined,
    title,
    description,
    rawAssessmentKind,
    assessmentKind,
    studentPrompt,
    evidenceToCollect,
    subject: optional(get('subject')),
    gradeLevel: optional(get('gradeLevel')),
    language: optional(get('language')),
    languageLevel: optional(get('languageLevel')),
    purpose: optional(get('purpose')),
    skill: optional(get('skill')),
    relatedUnit: optional(get('relatedUnit')),
    tags,
    status,
    notes: optional(get('notes')),
    presentFields,
    unmappedValues,
    validationErrors,
  };
}

export function buildAssessmentImportIdentity(externalSource: string, externalKey: string): string {
  return `assessment\u0000${normalizeToken(externalSource)}\u0000${normalizeToken(externalKey)}`;
}

function isRubricWorksheet(table: ImportTable): boolean {
  const headers = new Set(table.headers.map(normalizeToken));
  return (
    headers.has('rubricid') &&
    headers.has('criterionid') &&
    (headers.has('level4') || headers.has('level3') || headers.has('level2'))
  );
}

function comparableAssessmentRecord(item: LibraryCatalogItem): unknown {
  const comparable: Partial<LibraryCatalogItem> = { ...item };
  delete comparable.updatedAt;
  delete comparable.lastImportRunId;
  return comparable;
}

function sameRecord(first: LibraryCatalogItem, second: LibraryCatalogItem): boolean {
  return (
    stableImportFingerprint(comparableAssessmentRecord(first)) ===
    stableImportFingerprint(comparableAssessmentRecord(second))
  );
}

function preserveLegacyAssessmentId(
  normalized: NormalizedAssessmentImportRow,
): NormalizedAssessmentImportRow {
  if (!normalized.externalKey || normalized.externalSource) return normalized;
  const legacySection = `Legacy Assessment ID\n${normalized.externalKey}`;
  return {
    ...normalized,
    description: normalized.description
      ? `${normalized.description}\n\n${legacySection}`
      : legacySection,
    externalKey: undefined,
    externalSource: undefined,
    importIdentityKey: undefined,
  };
}

function mergeAssessment(
  existing: LibraryCatalogItem | undefined,
  normalized: NormalizedAssessmentImportRow,
  id: string,
  now: string,
  forcedStatus?: LibraryCatalogStatus,
): LibraryCatalogItem {
  const existingFields =
    existing?.typedFields?.catalogType === 'assessment' ? existing.typedFields : undefined;
  const has = (key: AssessmentImportFieldKey) => normalized.presentFields.includes(key);
  const status =
    forcedStatus ??
    (has('status') && normalized.status
      ? normalized.status
      : (existing?.status ?? normalized.status ?? 'active'));
  const importedDescription =
    has('description') || has('notes') || normalized.unmappedValues.length > 0;
  const typedFields: LibraryAssessmentFields = {
    catalogType: 'assessment',
    assessmentKind: normalized.assessmentKind ?? existingFields?.assessmentKind ?? 'formative',
    studentPrompt:
      has('studentPrompt') && normalized.studentPrompt
        ? normalized.studentPrompt
        : (existingFields?.studentPrompt ?? normalized.studentPrompt),
    evidenceToCollect:
      has('evidenceToCollect') && normalized.evidenceToCollect
        ? normalized.evidenceToCollect
        : (existingFields?.evidenceToCollect ?? normalized.evidenceToCollect),
  };
  return libraryCatalogItemSchema.parse({
    id,
    catalogType: 'assessment',
    title: normalized.title || existing?.title,
    description: importedDescription
      ? (normalized.description ?? existing?.description)
      : (existing?.description ?? normalized.description),
    tags: uniqueTags([...(existing?.tags ?? []), ...normalized.tags]),
    typedFields,
    externalSource: normalized.externalSource ?? existing?.externalSource,
    externalKey: normalized.externalKey ?? existing?.externalKey,
    sourceReference: normalized.sourceReference ?? existing?.sourceReference,
    importIdentityKey: normalized.importIdentityKey ?? existing?.importIdentityKey,
    lastImportRunId: existing?.lastImportRunId,
    status,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    archivedAt: status === 'archived' ? (existing?.archivedAt ?? now) : undefined,
  });
}

function normalizedRowFingerprint(row: NormalizedAssessmentImportRow): string {
  return stableImportFingerprint({ ...row, sourceRow: 0 });
}

export function buildAssessmentImportPreview(
  input: BuildAssessmentImportPreviewInput,
  dependencies: AssessmentImportPreviewDependencies = {},
): AssessmentImportPreview {
  if (input.mapping.title === null) {
    throw new Error('Map the Assessment title before previewing.');
  }
  if (input.table.rows.length === 0) {
    throw new Error('The selected table contains no data rows.');
  }
  if (input.table.rows.length > MAX_ASSESSMENT_IMPORT_ROWS) {
    throw new Error(
      `Import no more than ${MAX_ASSESSMENT_IMPORT_ROWS.toLocaleString('en-US')} Assessments at a time.`,
    );
  }
  const unresolvedColumns = listReviewableAssessmentUnmappedColumns(
    input.table,
    input.mapping,
  ).filter((column) => !input.unmappedDecisions[column.column]);
  if (unresolvedColumns.length > 0) {
    throw new Error('Review every non-empty unmapped source column before generating preview.');
  }

  const createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
  const generatedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  const importRunId = createId();
  const existingAssessments = input.existingItems
    .filter((item) => item.catalogType === 'assessment')
    .map((item) => libraryCatalogItemSchema.parse(item));
  const byIdentity = new Map(
    existingAssessments
      .filter((item) => item.importIdentityKey)
      .map((item) => [item.importIdentityKey as string, item] as const),
  );
  const rubricBlocked = isRubricWorksheet(input.table);
  const classificationSession = createImportClassificationResolutionSession({
    catalogType: 'assessment',
    categoryValues: input.categoryValues ?? [],
    decisions: input.classificationDecisions ?? {},
    createId,
    generatedAt,
  });
  const applicableFamilyIds = classificationSession.applicableFamilyIds;
  const assignmentsByItem = new Map<string, CategoryAssignment[]>();
  for (const rawAssignment of input.categoryAssignments ?? []) {
    const assignment = categoryAssignmentSchema.parse(rawAssignment);
    if (
      assignment.entityType !== 'library-item' ||
      !applicableFamilyIds.includes(assignment.familyId)
    ) {
      continue;
    }
    assignmentsByItem.set(assignment.entityId, [
      ...(assignmentsByItem.get(assignment.entityId) ?? []),
      assignment,
    ]);
  }
  for (const assignments of assignmentsByItem.values()) {
    assignments.sort((first, second) => first.id.localeCompare(second.id));
  }
  const presentFamilyIds = [
    ...(input.mapping.subject !== null ? (['subject'] as const) : []),
    ...(input.mapping.gradeLevel !== null ? (['grade-level'] as const) : []),
    ...(input.mapping.language !== null ? (['language'] as const) : []),
    ...(input.mapping.languageLevel !== null ? (['language-level'] as const) : []),
    ...(input.mapping.purpose !== null ? (['purpose-tag'] as const) : []),
    ...(input.mapping.skill !== null ? (['focus-tag'] as const) : []),
  ];

  const normalizedRows = input.table.rows.map((row) =>
    normalizeRow(
      row,
      input.table,
      input.mapping,
      input.defaults,
      input.unmappedDecisions,
      input.kindDecisions[row.sourceRow],
    ),
  );

  const identityGroups = new Map<string, NormalizedAssessmentImportRow[]>();
  for (const row of normalizedRows) {
    if (!row.importIdentityKey) continue;
    identityGroups.set(row.importIdentityKey, [
      ...(identityGroups.get(row.importIdentityKey) ?? []),
      row,
    ]);
  }

  const conflictingIdentityRows = new Set<number>();
  for (const group of identityGroups.values()) {
    const fingerprints = new Set(group.map(normalizedRowFingerprint));
    if (fingerprints.size > 1) {
      for (const row of group) conflictingIdentityRows.add(row.sourceRow);
    }
  }

  const identicalSourceRows = new Set<number>();
  const firstRowByFingerprint = new Map<string, number>();
  for (const row of normalizedRows) {
    const fingerprint = normalizedRowFingerprint(row);
    if (firstRowByFingerprint.has(fingerprint)) identicalSourceRows.add(row.sourceRow);
    else firstRowByFingerprint.set(fingerprint, row.sourceRow);
  }

  const rows: AssessmentImportPreviewRow[] = normalizedRows.map((normalized) => {
    const decision = input.duplicateDecisions[normalized.sourceRow];
    const validationReasons = [...normalized.validationErrors];
    if (rubricBlocked) {
      validationReasons.push(
        'This worksheet appears to contain Rubric criteria. Rubric rows are not Assessment import records.',
      );
    }
    if (conflictingIdentityRows.has(normalized.sourceRow)) {
      validationReasons.push(
        'The same stable Assessment identity has conflicting values in this source.',
      );
    }

    if (validationReasons.length > 0) {
      return {
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: validationReasons,
        normalized,
      };
    }

    if (identicalSourceRows.has(normalized.sourceRow)) {
      return {
        sourceRow: normalized.sourceRow,
        classification: 'skip',
        reasons: ['An identical Assessment row already appears earlier in this source.'],
        normalized,
      };
    }

    const kindReview: AssessmentKindReview | undefined = !normalized.assessmentKind
      ? {
          rawValue: normalized.rawAssessmentKind,
          message: normalized.rawAssessmentKind
            ? `Assessment Kind "${normalized.rawAssessmentKind}" requires review.`
            : 'Choose an Assessment Kind for this row or set a source default.',
        }
      : undefined;

    const identityMatch = normalized.importIdentityKey
      ? byIdentity.get(normalized.importIdentityKey)
      : undefined;
    const titleMatches = existingAssessments.filter(
      (item) => normalizedTitle(item.title) === normalizedTitle(normalized.title),
    );
    const titlePromptMatches = titleMatches.filter((item) => {
      const fields = item.typedFields?.catalogType === 'assessment' ? item.typedFields : undefined;
      return normalizedPrompt(fields?.studentPrompt) === normalizedPrompt(normalized.studentPrompt);
    });

    let duplicateReview: AssessmentDuplicateReview | undefined;
    if (normalized.externalKey && !normalized.externalSource) {
      duplicateReview = {
        kind: 'missing-source',
        message:
          'Assessment ID requires an External Source namespace before it can be a stable identity.',
        candidates: [],
      };
    } else if (identityMatch?.status === 'archived') {
      duplicateReview = {
        kind: 'archived-identity',
        message: 'The stable Assessment identity belongs to an archived record.',
        candidates: [
          {
            id: identityMatch.id,
            title: identityMatch.title,
            status: identityMatch.status,
            externalSource: identityMatch.externalSource,
            externalKey: identityMatch.externalKey,
            match: 'identity',
          },
        ],
      };
    } else if (!identityMatch && titleMatches.length > 0) {
      const candidateItems = titlePromptMatches.length > 0 ? titlePromptMatches : titleMatches;
      duplicateReview = {
        kind: 'probable-duplicate',
        message:
          titlePromptMatches.length > 0
            ? 'Title and student prompt match an existing Assessment; this never overwrites automatically.'
            : 'Title matches an existing Assessment; this never overwrites automatically.',
        candidates: candidateItems.map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status,
          externalSource: item.externalSource,
          externalKey: item.externalKey,
          match: titlePromptMatches.length > 0 ? ('title-and-prompt' as const) : ('title' as const),
        })),
      };
    }

    if (kindReview || (duplicateReview && !decision)) {
      return {
        sourceRow: normalized.sourceRow,
        classification: 'review',
        reasons: [
          ...(kindReview ? [kindReview.message] : []),
          ...(duplicateReview ? [duplicateReview.message] : []),
        ],
        normalized,
        duplicateReview,
        kindReview,
      };
    }

    if (decision?.action === 'skip') {
      const targetId = duplicateReview?.candidates[0]?.id;
      return {
        sourceRow: normalized.sourceRow,
        classification: 'skip',
        reasons: ['The reviewed duplicate decision skips this Assessment row.'],
        normalized,
        duplicateReview,
        kindReview,
        planned: targetId
          ? {
              existingItem: existingAssessments.find((item) => item.id === targetId),
              expectedAssignments: assignmentsByItem.get(targetId) ?? [],
              assignmentsToDelete: [],
              assignmentsToCreate: [],
              categoryValueIds: [],
            }
          : undefined,
      };
    }

    const targetId = decision && 'targetId' in decision ? decision.targetId : identityMatch?.id;
    const target = targetId
      ? existingAssessments.find((item) => item.id === targetId)
      : identityMatch;

    if (targetId && !target) {
      return {
        sourceRow: normalized.sourceRow,
        classification: 'review',
        reasons: ['The selected Assessment duplicate target no longer exists.'],
        normalized,
        duplicateReview,
        kindReview,
      };
    }

    const effectiveNormalized =
      decision?.action === 'create' ? preserveLegacyAssessmentId(normalized) : normalized;
    if (
      decision?.action === 'create' &&
      effectiveNormalized.description &&
      effectiveNormalized.description.length > 5_000
    ) {
      return {
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: [
          'Preserving the legacy Assessment ID would exceed the 5,000-character description limit.',
        ],
        normalized,
        duplicateReview,
        kindReview,
      };
    }

    const classification = classificationSession.resolveRow({
      sourceRow: normalized.sourceRow,
      values: {
        subject: effectiveNormalized.subject,
        'grade-level': effectiveNormalized.gradeLevel,
        language: effectiveNormalized.language,
        'language-level': effectiveNormalized.languageLevel,
        'purpose-tag': effectiveNormalized.purpose,
        'focus-tag': effectiveNormalized.skill,
      },
      presentFamilyIds,
    });
    if (classification.blockingReasons.length > 0) {
      return {
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: classification.blockingReasons,
        normalized: effectiveNormalized,
        duplicateReview,
        kindReview,
        classificationReviews: [],
      };
    }
    if (classification.reviews.length > 0) {
      return {
        sourceRow: normalized.sourceRow,
        classification: 'review',
        reasons: classification.reviewReasons,
        normalized: effectiveNormalized,
        duplicateReview,
        kindReview,
        classificationReviews: classification.reviews,
        planned: {
          existingItem: target,
          expectedAssignments: target ? (assignmentsByItem.get(target.id) ?? []) : [],
          assignmentsToDelete: [],
          assignmentsToCreate: [],
          categoryValueIds: [],
          classificationReviews: classification.reviews,
        },
      };
    }
    const classifiedNormalized: NormalizedAssessmentImportRow = {
      ...effectiveNormalized,
      tags: uniqueTags([...effectiveNormalized.tags, ...classification.genericTags]),
    };

    const forcedStatus =
      decision?.action === 'restore-update'
        ? 'active'
        : decision?.action === 'update-archived'
          ? 'archived'
          : undefined;

    if (decision?.action === 'create' || (!target && !identityMatch)) {
      const itemId = createId();
      const withoutRun = mergeAssessment(
        undefined,
        classifiedNormalized,
        itemId,
        generatedAt,
        forcedStatus,
      );
      const assignmentPlan = planImportClassificationAssignments({
        entityId: itemId,
        existingAssignments: [],
        resolution: classification,
        applicableFamilyIds,
        createId,
        generatedAt,
      });
      const item = libraryCatalogItemSchema.parse({
        ...withoutRun,
        lastImportRunId: importRunId,
      });
      return {
        sourceRow: normalized.sourceRow,
        classification: 'create',
        reasons: [
          duplicateReview
            ? 'The reviewed decision creates a separate Assessment.'
            : 'No strong existing identity was selected; create a new Assessment.',
          ...(assignmentPlan.assignmentsToCreate.length
            ? ['Apply the reviewed Library classification assignments.']
            : []),
        ],
        normalized: classifiedNormalized,
        duplicateReview,
        kindReview,
        classificationReviews: [],
        planned: {
          item,
          expectedAssignments: assignmentPlan.expectedAssignments,
          assignmentsToDelete: assignmentPlan.assignmentsToDelete,
          assignmentsToCreate: assignmentPlan.assignmentsToCreate,
          categoryValueIds: assignmentPlan.desiredCategoryValueIds,
          classificationReviews: [],
        },
      };
    }

    if (!target) {
      return {
        sourceRow: normalized.sourceRow,
        classification: 'review',
        reasons: ['Choose how this Assessment row should be handled.'],
        normalized,
        duplicateReview,
        kindReview,
      };
    }

    const withoutRun = mergeAssessment(
      target,
      classifiedNormalized,
      target.id,
      generatedAt,
      forcedStatus,
    );
    const assignmentPlan = planImportClassificationAssignments({
      entityId: target.id,
      existingAssignments: assignmentsByItem.get(target.id) ?? [],
      resolution: classification,
      applicableFamilyIds,
      createId,
      generatedAt,
    });
    const classificationSnapshot = classificationSession.snapshot();
    const lifecycleIds = new Set([
      ...classificationSnapshot.newCategoryValues.map((value) => value.id),
      ...classificationSnapshot.restoredCategoryValues.map((value) => value.after.id),
    ]);
    const classificationChanged =
      assignmentPlan.assignmentsToDelete.length > 0 ||
      assignmentPlan.assignmentsToCreate.length > 0 ||
      assignmentPlan.desiredCategoryValueIds.some((id) => lifecycleIds.has(id));
    if (sameRecord(withoutRun, target) && !classificationChanged) {
      return {
        sourceRow: normalized.sourceRow,
        classification: 'skip',
        reasons: ['The stable Assessment identity already has the same reviewed values.'],
        normalized: classifiedNormalized,
        duplicateReview,
        kindReview,
        classificationReviews: [],
        planned: {
          existingItem: target,
          expectedAssignments: assignmentPlan.expectedAssignments,
          assignmentsToDelete: [],
          assignmentsToCreate: [],
          categoryValueIds: assignmentPlan.desiredCategoryValueIds,
          classificationReviews: [],
        },
      };
    }

    const item = libraryCatalogItemSchema.parse({
      ...withoutRun,
      lastImportRunId: importRunId,
    });
    return {
      sourceRow: normalized.sourceRow,
      classification: 'update',
      reasons: [
        'The reviewed stable identity or explicit duplicate decision updates this Assessment.',
        ...(classificationChanged
          ? ['Apply the reviewed Library classification assignments.']
          : []),
      ],
      normalized: classifiedNormalized,
      duplicateReview,
      kindReview,
      classificationReviews: [],
      planned: {
        item,
        existingItem: target,
        expectedAssignments: assignmentPlan.expectedAssignments,
        assignmentsToDelete: assignmentPlan.assignmentsToDelete,
        assignmentsToCreate: assignmentPlan.assignmentsToCreate,
        categoryValueIds: assignmentPlan.desiredCategoryValueIds,
        classificationReviews: [],
      },
    };
  });

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
      kindDecisions: input.kindDecisions,
      classificationDecisions: input.classificationDecisions,
    },
    generatedAt,
  );

  const classificationSnapshot = classificationSession.snapshot();
  return {
    ...genericPreview,
    importRunId,
    rows,
    defaults: {
      externalSource: optional(input.defaults.externalSource ?? ''),
      sourceReference: optional(input.defaults.sourceReference ?? ''),
      assessmentKind: input.defaults.assessmentKind,
    },
    newCategoryValues: classificationSnapshot.newCategoryValues,
    restoredCategoryValues: classificationSnapshot.restoredCategoryValues,
    expectedCategoryValues: classificationSnapshot.expectedCategoryValues,
    classificationReviews: classificationSnapshot.classificationReviews,
    classificationAudit: classificationSnapshot.classificationAudit,
  };
}
