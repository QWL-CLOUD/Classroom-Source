import {
  categoryAssignmentSchema,
  libraryCatalogItemSchema,
  type CategoryAssignment,
  type CategoryValue,
  type LibraryCatalogItem,
  type LibraryCatalogStatus,
  type LibraryResourceFields,
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
  type ImportClassificationDecision,
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

import {
  inspectResourceUrl,
  normalizeResourceLocationForDuplicate,
} from './resourceImportSourceAdapters';

export const MAX_RESOURCE_IMPORT_ROWS = 5_000;

export const resourceImportFieldKeys = [
  'externalKey',
  'title',
  'description',
  'resourceFormat',
  'sourceLocation',
  'usageNotes',
  'subject',
  'gradeLevel',
  'language',
  'languageLevel',
  'purpose',
  'skill',
  'versionYear',
  'owner',
  'lastChecked',
  'accessNotes',
  'relatedUnit',
  'rightsLicense',
  'tags',
  'externalSource',
  'sourceReference',
  'status',
  'notes',
] as const;

export type ResourceImportFieldKey = (typeof resourceImportFieldKeys)[number];
export type ResourceImportColumnMapping = ImportColumnMapping<ResourceImportFieldKey>;

export const resourceImportFieldLabels: Record<ResourceImportFieldKey, string> = {
  externalKey: 'Resource ID / external key',
  title: 'Title',
  description: 'Description',
  resourceFormat: 'Resource format',
  sourceLocation: 'Source or location',
  usageNotes: 'Usage notes',
  subject: 'Subject',
  gradeLevel: 'Grade level',
  language: 'Language',
  languageLevel: 'Language level',
  purpose: 'Purpose',
  skill: 'Skill / focus',
  versionYear: 'Version / year',
  owner: 'Owner / author',
  lastChecked: 'Last checked',
  accessNotes: 'Access notes',
  relatedUnit: 'Related unit',
  rightsLicense: 'Rights / license',
  tags: 'Tags',
  externalSource: 'External source namespace',
  sourceReference: 'Source reference',
  status: 'Status',
  notes: 'Notes',
};

const aliases: ImportHeaderAliases<ResourceImportFieldKey> = {
  externalKey: ['resourceid', 'materialid', 'externalkey', 'resourcekey', 'catalogid', 'id'],
  title: ['title', 'resourcetitle', 'materialtitle', 'name'],
  description: ['description', 'summary', 'overview'],
  resourceFormat: [
    'resourceformat',
    'resourcetype',
    'format',
    'type',
    'category',
    'filetype',
    'mediatype',
  ],
  sourceLocation: [
    'sourceorlocation',
    'sourcelocation',
    'url',
    'link',
    'filelink',
    'location',
    'path',
  ],
  usageNotes: ['usagenotes', 'use', 'usenotes', 'preparation', 'instructions'],
  subject: ['subject', 'subjects', 'contentarea'],
  gradeLevel: ['gradelevel', 'grade', 'grades'],
  language: ['language', 'languages', 'instructionallanguage', 'targetlanguage'],
  languageLevel: ['languagelevel', 'proficiencylevel', 'clalevel'],
  purpose: ['purpose', 'purposes', 'purposetag', 'purposetags'],
  skill: ['skill', 'skills', 'focus', 'focustag', 'focustags'],
  versionYear: ['versionyear', 'version', 'year', 'edition'],
  owner: ['owner', 'creator', 'author', 'provider'],
  lastChecked: ['lastchecked', 'checkedon', 'reviewedon', 'lastreviewed'],
  accessNotes: ['accessnotes', 'access', 'permissions', 'loginnotes'],
  relatedUnit: ['relatedunit', 'unit', 'module'],
  rightsLicense: ['rightslicense', 'rights', 'license', 'copyright'],
  tags: ['tags', 'tag', 'keywords', 'labels'],
  externalSource: ['externalsource', 'sourceorganization', 'organization', 'catalog', 'publisher'],
  sourceReference: ['sourcereference', 'citation', 'reference', 'provenance'],
  status: ['status', 'lifecycle', 'state'],
  notes: ['notes', 'note', 'importnotes'],
};

export function createEmptyResourceImportMapping(): ResourceImportColumnMapping {
  return createEmptyImportColumnMapping(resourceImportFieldKeys);
}

export function suggestResourceImportMapping(
  headers: readonly string[],
): ResourceImportColumnMapping {
  return suggestImportColumnMapping(headers, resourceImportFieldKeys, aliases);
}

export type UnmappedColumnDecision = 'notes' | 'ignore';
export type UnmappedColumnDecisions = Record<number, UnmappedColumnDecision | undefined>;

export interface ReviewableUnmappedColumn {
  column: number;
  header: string;
  nonEmptyCount: number;
}

export function listReviewableResourceUnmappedColumns(
  table: ImportTable,
  mapping: ResourceImportColumnMapping,
): ReviewableUnmappedColumn[] {
  const mapped = new Set(
    resourceImportFieldKeys
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

export interface ResourceImportDefaults {
  externalSource?: string;
  sourceReference?: string;
}

export type ResourceDuplicateDecision =
  | { action: 'create' }
  | { action: 'skip' }
  | { action: 'update'; targetId: string }
  | { action: 'update-archived'; targetId: string }
  | { action: 'restore-update'; targetId: string };

export type ResourceDuplicateDecisions = Record<number, ResourceDuplicateDecision | undefined>;

export type ResourceFormatDecision =
  | Extract<ImportClassificationDecision, { action: 'use' | 'restore' | 'create' }>
  | { action: 'none' };

export type ResourceFormatDecisions = Record<string, ResourceFormatDecision | undefined>;
export type ResourceClassificationDecisions = ImportClassificationDecisions;

export type ResourceSourceDecision = { action: 'keep' } | { action: 'skip' };
export type ResourceSourceDecisions = Record<number, ResourceSourceDecision | undefined>;

export interface ResourceDuplicateCandidate {
  id: string;
  title: string;
  status: LibraryCatalogStatus;
  sourceLocation?: string;
  externalSource?: string;
  externalKey?: string;
  match: 'identity' | 'title' | 'source-location' | 'source-and-title';
}

export interface ResourceDuplicateReview {
  kind: 'missing-source' | 'archived-identity' | 'probable-duplicate';
  message: string;
  candidates: ResourceDuplicateCandidate[];
}

export type ResourceFormatReview = ImportClassificationReview;

export interface ResourceSourceReview {
  kind: 'credential-url';
  message: string;
  parameters: string[];
}

export interface NormalizedResourceImportRow {
  sourceRow: number;
  externalKey?: string;
  externalSource?: string;
  sourceReference?: string;
  importIdentityKey?: string;
  title: string;
  description?: string;
  resourceFormat?: string;
  sourceLocation?: string;
  usageNotes?: string;
  subject?: string;
  gradeLevel?: string;
  language?: string;
  languageLevel?: string;
  purpose?: string;
  skill?: string;
  versionYear?: string;
  owner?: string;
  lastChecked?: string;
  accessNotes?: string;
  relatedUnit?: string;
  rightsLicense?: string;
  notes?: string;
  tags: string[];
  status?: LibraryCatalogStatus;
  presentFields: ResourceImportFieldKey[];
  unmappedValues: Array<{ header: string; value: string }>;
  validationErrors: string[];
  sourceReview?: ResourceSourceReview;
}

export interface PlannedResourceImportRow {
  normalized: NormalizedResourceImportRow;
  item?: LibraryCatalogItem;
  existingItem?: LibraryCatalogItem;
  expectedAssignments: CategoryAssignment[];
  assignmentsToDelete: CategoryAssignment[];
  assignmentsToCreate: CategoryAssignment[];
  resourceFormatValueId?: string;
  duplicateReview?: ResourceDuplicateReview;
  formatReview?: ResourceFormatReview;
  classificationReviews?: ImportClassificationReview[];
  sourceReview?: ResourceSourceReview;
}

export interface ResourceImportPreviewRow extends ImportPreviewRow<PlannedResourceImportRow> {
  normalized: NormalizedResourceImportRow;
  duplicateReview?: ResourceDuplicateReview;
  formatReview?: ResourceFormatReview;
  classificationReviews?: ImportClassificationReview[];
  sourceReview?: ResourceSourceReview;
}

export interface ResourceImportPreview extends Omit<
  ImportPreview<PlannedResourceImportRow>,
  'rows'
> {
  importRunId: string;
  rows: ResourceImportPreviewRow[];
  defaults: ResourceImportDefaults;
  newCategoryValues: CategoryValue[];
  restoredCategoryValues: Array<{ before: CategoryValue; after: CategoryValue }>;
  expectedCategoryValues: CategoryValue[];
  formatReviews: ResourceFormatReview[];
  classificationReviews: ImportClassificationReview[];
  classificationAudit: ImportClassificationAuditRecord[];
}

export interface BuildResourceImportPreviewInput {
  table: ImportTable;
  mapping: ResourceImportColumnMapping;
  defaults: ResourceImportDefaults;
  unmappedDecisions: UnmappedColumnDecisions;
  duplicateDecisions: ResourceDuplicateDecisions;
  formatDecisions: ResourceFormatDecisions;
  classificationDecisions?: ResourceClassificationDecisions;
  sourceDecisions: ResourceSourceDecisions;
  existingItems: readonly LibraryCatalogItem[];
  categoryValues: readonly CategoryValue[];
  categoryAssignments: readonly CategoryAssignment[];
}

export interface ResourceImportPreviewDependencies {
  createId?: () => string;
  now?: () => string;
}

function optional(value: string): string | undefined {
  return value || undefined;
}

function normalizeIdentityPart(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function buildResourceImportIdentity(externalSource: string, externalKey: string): string {
  return `resource\u0000${normalizeIdentityPart(externalSource)}\u0000${normalizeIdentityPart(externalKey)}`;
}

export function normalizeResourceTitle(value: string): string {
  return normalizeIdentityPart(value);
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

function parseStatus(value: string): { value?: LibraryCatalogStatus; error?: string } {
  if (!value) return {};
  const normalized = normalizeIdentityPart(value);
  if (['active', 'current', 'published'].includes(normalized)) return { value: 'active' };
  if (['archived', 'archive', 'inactive'].includes(normalized)) return { value: 'archived' };
  return { error: `Unknown status “${value}”.` };
}

function composeUsageNotes(
  values: Array<[string, string | undefined]>,
  unmapped: Array<{ header: string; value: string }>,
): string | undefined {
  const sections: string[] = [];
  for (const [label, value] of values) {
    if (value) sections.push(`${label}\n${value}`);
  }
  for (const value of unmapped) sections.push(`Imported column: ${value.header}\n${value.value}`);
  return sections.length ? sections.join('\n\n') : undefined;
}

function valueFor(
  row: ImportTableRow,
  mapping: ResourceImportColumnMapping,
  key: ResourceImportFieldKey,
): string {
  return mappedImportValue(row, mapping, key);
}

function normalizeRow(
  row: ImportTableRow,
  table: ImportTable,
  mapping: ResourceImportColumnMapping,
  defaults: ResourceImportDefaults,
  unmappedDecisions: UnmappedColumnDecisions,
): NormalizedResourceImportRow {
  const validationErrors: string[] = [];
  const status = parseStatus(valueFor(row, mapping, 'status'));
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
  const sourceLocation = optional(valueFor(row, mapping, 'sourceLocation'));
  const resourceFormat = optional(valueFor(row, mapping, 'resourceFormat'));

  const unmappedValues = listReviewableResourceUnmappedColumns(table, mapping)
    .filter((column) => unmappedDecisions[column.column] === 'notes')
    .map((column) => ({
      header: column.header,
      value: normalizeImportText(row.values[column.column] ?? ''),
    }))
    .filter((value) => value.value);

  const usageNotes = composeUsageNotes(
    [
      ['Usage notes', optional(valueFor(row, mapping, 'usageNotes'))],
      ['Version / year', optional(valueFor(row, mapping, 'versionYear'))],
      ['Owner', optional(valueFor(row, mapping, 'owner'))],
      ['Last checked', optional(valueFor(row, mapping, 'lastChecked'))],
      ['Access notes', optional(valueFor(row, mapping, 'accessNotes'))],
      ['Rights / license', optional(valueFor(row, mapping, 'rightsLicense'))],
      ['Imported notes', optional(valueFor(row, mapping, 'notes'))],
    ],
    unmappedValues,
  );

  const subject = optional(valueFor(row, mapping, 'subject'));
  const gradeLevel = optional(valueFor(row, mapping, 'gradeLevel'));
  const language = optional(valueFor(row, mapping, 'language'));
  const languageLevel = optional(valueFor(row, mapping, 'languageLevel'));
  const purpose = optional(valueFor(row, mapping, 'purpose'));
  const skill = optional(valueFor(row, mapping, 'skill'));
  const relatedUnit = optional(valueFor(row, mapping, 'relatedUnit'));
  const tagMap = new Map<string, string>();
  for (const tag of splitTags(valueFor(row, mapping, 'tags'))) addUniqueTag(tagMap, tag);
  if (relatedUnit) addUniqueTag(tagMap, `Unit: ${relatedUnit}`);

  const description = optional(valueFor(row, mapping, 'description'));
  if (!title) validationErrors.push('Title is required.');
  if (title.length > 240) validationErrors.push('Title exceeds 240 characters.');
  if (description && description.length > 5000)
    validationErrors.push('Description exceeds 5,000 characters.');
  if (sourceLocation && sourceLocation.length > 2000)
    validationErrors.push('Source or location exceeds 2,000 characters.');
  if (usageNotes && usageNotes.length > 5000)
    validationErrors.push('Usage notes exceed 5,000 characters.');
  if (externalKey && externalKey.length > 500)
    validationErrors.push('Resource ID exceeds 500 characters.');
  if (externalSource && externalSource.length > 500)
    validationErrors.push('External source exceeds 500 characters.');
  if (sourceReference && sourceReference.length > 2000)
    validationErrors.push('Source reference exceeds 2,000 characters.');
  if (resourceFormat && resourceFormat.length > 120)
    validationErrors.push('Resource Format exceeds 120 characters.');
  for (const tag of tagMap.values()) {
    if (tag.length > 80) validationErrors.push(`Tag “${tag}” exceeds 80 characters.`);
  }
  if (tagMap.size > 30) validationErrors.push('This row contains more than 30 searchable tags.');

  let sourceReview: ResourceSourceReview | undefined;
  if (sourceLocation && /^[a-z][a-z\d+.-]*:/i.test(sourceLocation)) {
    const inspected = inspectResourceUrl(sourceLocation);
    if (inspected.error) validationErrors.push(inspected.error);
    else if (inspected.credentialParameters.length) {
      sourceReview = {
        kind: 'credential-url',
        message: `This URL may contain a temporary credential or private access token: ${inspected.credentialParameters.join(', ')}.`,
        parameters: inspected.credentialParameters,
      };
    }
  }

  return {
    sourceRow: row.sourceRow,
    externalKey,
    externalSource,
    sourceReference,
    importIdentityKey:
      externalKey && externalSource
        ? buildResourceImportIdentity(externalSource, externalKey)
        : undefined,
    title,
    description,
    resourceFormat,
    sourceLocation,
    usageNotes,
    subject,
    gradeLevel,
    language,
    languageLevel,
    purpose,
    skill,
    versionYear: optional(valueFor(row, mapping, 'versionYear')),
    owner: optional(valueFor(row, mapping, 'owner')),
    lastChecked: optional(valueFor(row, mapping, 'lastChecked')),
    accessNotes: optional(valueFor(row, mapping, 'accessNotes')),
    relatedUnit,
    rightsLicense: optional(valueFor(row, mapping, 'rightsLicense')),
    notes: optional(valueFor(row, mapping, 'notes')),
    tags: [...tagMap.values()],
    status: status.value,
    presentFields: resourceImportFieldKeys.filter((key) => mapping[key] !== null),
    unmappedValues,
    validationErrors,
    sourceReview,
  };
}

function resourceFields(item: LibraryCatalogItem | undefined): LibraryResourceFields {
  return item?.typedFields?.catalogType === 'resource'
    ? item.typedFields
    : { catalogType: 'resource' };
}

function comparableResourceRecord(item: LibraryCatalogItem): unknown {
  const comparable: Partial<LibraryCatalogItem> = { ...item };
  delete comparable.updatedAt;
  delete comparable.lastImportRunId;
  return comparable;
}

function sameRecord(first: LibraryCatalogItem, second: LibraryCatalogItem): boolean {
  return (
    stableImportFingerprint(comparableResourceRecord(first)) ===
    stableImportFingerprint(comparableResourceRecord(second))
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

function duplicateCandidate(
  item: LibraryCatalogItem,
  match: ResourceDuplicateCandidate['match'],
): ResourceDuplicateCandidate {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    sourceLocation:
      item.typedFields?.catalogType === 'resource' ? item.typedFields.sourceLocation : undefined,
    externalSource: item.externalSource,
    externalKey: item.externalKey,
    match,
  };
}

function compareAssignment(first: CategoryAssignment, second: CategoryAssignment): number {
  return first.id.localeCompare(second.id);
}

export function buildResourceImportPreview(
  input: BuildResourceImportPreviewInput,
  dependencies: ResourceImportPreviewDependencies = {},
): ResourceImportPreview {
  if (input.mapping.title === null) throw new Error('Map the Resource title before previewing.');
  if (input.table.rows.length === 0) throw new Error('The selected table contains no data rows.');
  if (input.table.rows.length > MAX_RESOURCE_IMPORT_ROWS) {
    throw new Error(
      `Import no more than ${MAX_RESOURCE_IMPORT_ROWS.toLocaleString('en-US')} Resources at a time.`,
    );
  }
  const unresolvedColumns = listReviewableResourceUnmappedColumns(
    input.table,
    input.mapping,
  ).filter((column) => !input.unmappedDecisions[column.column]);
  if (unresolvedColumns.length) {
    throw new Error('Review every non-empty unmapped source column before generating preview.');
  }

  const createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
  const generatedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  const importRunId = createId();
  const resources = input.existingItems.filter((item) => item.catalogType === 'resource');
  const byId = new Map(resources.map((item) => [item.id, item] as const));
  const byIdentity = new Map(
    resources
      .filter((item) => item.importIdentityKey)
      .map((item) => [item.importIdentityKey!, item] as const),
  );
  const byTitle = new Map<string, LibraryCatalogItem[]>();
  const byLocation = new Map<string, LibraryCatalogItem[]>();
  for (const item of resources) {
    const titleKey = normalizeResourceTitle(item.title);
    byTitle.set(titleKey, [...(byTitle.get(titleKey) ?? []), item]);
    const location =
      item.typedFields?.catalogType === 'resource' ? item.typedFields.sourceLocation : undefined;
    if (location) {
      const locationKey = normalizeResourceLocationForDuplicate(location);
      byLocation.set(locationKey, [...(byLocation.get(locationKey) ?? []), item]);
    }
  }

  const assignmentsByItem = new Map<string, CategoryAssignment[]>();
  for (const assignment of input.categoryAssignments) {
    if (assignment.entityType !== 'library-item') continue;
    assignmentsByItem.set(assignment.entityId, [
      ...(assignmentsByItem.get(assignment.entityId) ?? []),
      categoryAssignmentSchema.parse(assignment),
    ]);
  }

  const legacyFormatDecisions: ImportClassificationDecisions = {};
  for (const [key, decision] of Object.entries(input.formatDecisions)) {
    if (!decision) continue;
    legacyFormatDecisions[key] = decision.action === 'none' ? { action: 'ignore' } : decision;
  }
  const classificationSession = createImportClassificationResolutionSession({
    catalogType: 'resource',
    categoryValues: input.categoryValues,
    decisions: { ...legacyFormatDecisions, ...(input.classificationDecisions ?? {}) },
    createId,
    generatedAt,
  });
  const applicableFamilyIds = classificationSession.applicableFamilyIds;
  for (const [entityId, assignments] of assignmentsByItem) {
    assignmentsByItem.set(
      entityId,
      assignments
        .filter((assignment) => applicableFamilyIds.includes(assignment.familyId))
        .sort(compareAssignment),
    );
  }
  const presentFamilyIds = [
    ...(input.mapping.subject !== null ? (['subject'] as const) : []),
    ...(input.mapping.gradeLevel !== null ? (['grade-level'] as const) : []),
    ...(input.mapping.language !== null ? (['language'] as const) : []),
    ...(input.mapping.languageLevel !== null ? (['language-level'] as const) : []),
    ...(input.mapping.resourceFormat !== null ? (['resource-format'] as const) : []),
    ...(input.mapping.purpose !== null ? (['purpose-tag'] as const) : []),
    ...(input.mapping.skill !== null ? (['focus-tag'] as const) : []),
  ];

  const normalizedRows = input.table.rows.map((row) =>
    normalizeRow(row, input.table, input.mapping, input.defaults, input.unmappedDecisions),
  );

  const identityGroups = new Map<string, NormalizedResourceImportRow[]>();
  for (const row of normalizedRows) {
    if (!row.importIdentityKey) continue;
    identityGroups.set(row.importIdentityKey, [
      ...(identityGroups.get(row.importIdentityKey) ?? []),
      row,
    ]);
  }
  const conflictingIdentityRows = new Set<number>();
  for (const group of identityGroups.values()) {
    if (group.length < 2) continue;
    const fingerprints = new Set(
      group.map((row) => stableImportFingerprint({ ...row, sourceRow: 0 })),
    );
    if (fingerprints.size > 1) group.forEach((row) => conflictingIdentityRows.add(row.sourceRow));
  }

  const repeatedRows = new Set<number>();
  const firstByFingerprint = new Map<string, number>();
  for (const row of normalizedRows) {
    const fingerprint = stableImportFingerprint({ ...row, sourceRow: 0 });
    if (firstByFingerprint.has(fingerprint)) repeatedRows.add(row.sourceRow);
    else firstByFingerprint.set(fingerprint, row.sourceRow);
  }

  const rows: ResourceImportPreviewRow[] = [];
  for (const normalized of normalizedRows) {
    if (normalized.validationErrors.length) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: normalized.validationErrors,
        normalized,
        sourceReview: normalized.sourceReview,
      });
      continue;
    }
    if (conflictingIdentityRows.has(normalized.sourceRow)) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: ['The same stable Resource identity appears with conflicting source values.'],
        normalized,
      });
      continue;
    }
    if (repeatedRows.has(normalized.sourceRow)) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'skip',
        reasons: ['This row exactly repeats an earlier source row.'],
        normalized,
      });
      continue;
    }

    if (normalized.sourceReview) {
      const sourceDecision = input.sourceDecisions[normalized.sourceRow];
      if (!sourceDecision) {
        rows.push({
          sourceRow: normalized.sourceRow,
          classification: 'review',
          reasons: [normalized.sourceReview.message],
          normalized,
          sourceReview: normalized.sourceReview,
        });
        continue;
      }
      if (sourceDecision.action === 'skip') {
        rows.push({
          sourceRow: normalized.sourceRow,
          classification: 'skip',
          reasons: ['Skip this URL after reviewing its possible credential parameters.'],
          normalized,
          sourceReview: normalized.sourceReview,
        });
        continue;
      }
    }

    let target = normalized.importIdentityKey
      ? byIdentity.get(normalized.importIdentityKey)
      : undefined;
    let duplicateReview: ResourceDuplicateReview | undefined;
    if (target?.status === 'archived') {
      duplicateReview = {
        kind: 'archived-identity',
        message: 'The stable Resource identity matches an archived Library record.',
        candidates: [duplicateCandidate(target, 'identity')],
      };
    } else if (normalized.externalKey && !normalized.externalSource) {
      duplicateReview = {
        kind: 'missing-source',
        message: 'Resource ID requires a stable external source namespace before it can update.',
        candidates: [],
      };
    } else if (!target) {
      const candidates = new Map<string, ResourceDuplicateCandidate>();
      const titleMatches = byTitle.get(normalizeResourceTitle(normalized.title)) ?? [];
      const locationMatches = normalized.sourceLocation
        ? (byLocation.get(normalizeResourceLocationForDuplicate(normalized.sourceLocation)) ?? [])
        : [];
      for (const item of titleMatches) candidates.set(item.id, duplicateCandidate(item, 'title'));
      for (const item of locationMatches) {
        candidates.set(
          item.id,
          duplicateCandidate(
            item,
            titleMatches.some((candidate) => candidate.id === item.id)
              ? 'source-and-title'
              : 'source-location',
          ),
        );
      }
      if (candidates.size) {
        duplicateReview = {
          kind: 'probable-duplicate',
          message:
            'Title or source-location equality is only a probable duplicate and never overwrites automatically.',
          candidates: [...candidates.values()],
        };
      }
    }

    const forcedAction = input.duplicateDecisions[normalized.sourceRow];
    if (duplicateReview && !forcedAction) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'review',
        reasons: [duplicateReview.message],
        normalized,
        duplicateReview,
      });
      continue;
    }
    if (forcedAction) {
      if (forcedAction.action === 'skip') {
        rows.push({
          sourceRow: normalized.sourceRow,
          classification: 'skip',
          reasons: ['Skip this row after duplicate review.'],
          normalized,
          duplicateReview,
        });
        continue;
      }
      if (forcedAction.action === 'create') target = undefined;
      else {
        target = byId.get(forcedAction.targetId);
        if (!target) {
          rows.push({
            sourceRow: normalized.sourceRow,
            classification: 'review',
            reasons: ['The selected Resource is no longer available.'],
            normalized,
            duplicateReview,
          });
          continue;
        }
        if (forcedAction.action === 'update' && target.status !== 'active') {
          rows.push({
            sourceRow: normalized.sourceRow,
            classification: 'review',
            reasons: ['Choose whether the archived Resource should stay archived or be restored.'],
            normalized,
            duplicateReview,
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
            reasons: ['The selected Resource is no longer archived.'],
            normalized,
            duplicateReview,
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
        reasons: ['The Resource import identity is already used by another Library record.'],
        normalized,
        duplicateReview,
      });
      continue;
    }

    const classification = classificationSession.resolveRow({
      sourceRow: normalized.sourceRow,
      values: {
        subject: normalized.subject,
        'grade-level': normalized.gradeLevel,
        language: normalized.language,
        'language-level': normalized.languageLevel,
        'resource-format': normalized.resourceFormat,
        'purpose-tag': normalized.purpose,
        'focus-tag': normalized.skill,
      },
      presentFamilyIds,
    });
    if (classification.blockingReasons.length > 0) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: classification.blockingReasons,
        normalized,
        duplicateReview,
        classificationReviews: [],
      });
      continue;
    }
    const classificationReviews = classification.reviews;
    const formatReview = classificationReviews.find(
      (review) => review.familyId === 'resource-format',
    );
    if (classificationReviews.length > 0) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'review',
        reasons: classification.reviewReasons,
        normalized,
        duplicateReview,
        formatReview,
        classificationReviews,
        planned: {
          normalized,
          existingItem: target,
          expectedAssignments: target
            ? [...(assignmentsByItem.get(target.id) ?? [])].sort(compareAssignment)
            : [],
          assignmentsToDelete: [],
          assignmentsToCreate: [],
          duplicateReview,
          formatReview,
          classificationReviews,
          sourceReview: normalized.sourceReview,
        },
      });
      continue;
    }

    const tagMap = new Map<string, string>();
    for (const tag of target?.tags ?? []) addUniqueTag(tagMap, tag);
    for (const tag of normalized.tags) addUniqueTag(tagMap, tag);
    for (const tag of classification.genericTags) addUniqueTag(tagMap, tag);
    const mergedTags = [...tagMap.values()];
    if (mergedTags.length > 30 || mergedTags.some((tag) => tag.length > 80)) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: ['The reviewed update would exceed the Library tag limits.'],
        normalized,
        duplicateReview,
      });
      continue;
    }

    let externalKey = normalized.externalKey;
    let externalSource = normalized.externalSource;
    let importIdentityKey = normalized.importIdentityKey;
    let importedUsageNotes = normalized.usageNotes;
    if (normalized.externalKey && !normalized.externalSource && forcedAction?.action === 'create') {
      importedUsageNotes = composeUsageNotes(
        [
          ['Legacy Resource ID', normalized.externalKey],
          ['Usage notes', importedUsageNotes],
        ],
        [],
      );
      externalKey = undefined;
      externalSource = undefined;
      importIdentityKey = undefined;
    }

    const existingFields = resourceFields(target);
    let status = normalized.status ?? target?.status ?? 'active';
    if (forcedAction?.action === 'restore-update') status = 'active';
    if (forcedAction?.action === 'update-archived') status = 'archived';
    const itemId = target?.id ?? createId();
    const withoutRun = libraryCatalogItemSchema.parse({
      id: itemId,
      catalogType: 'resource',
      title: normalized.title,
      description: normalized.description ?? target?.description,
      tags: mergedTags,
      typedFields: {
        catalogType: 'resource',
        sourceLocation: normalized.sourceLocation ?? existingFields.sourceLocation,
        usageNotes: mergeImportedNotes(existingFields.usageNotes, importedUsageNotes),
      },
      externalSource: externalSource ?? target?.externalSource,
      externalKey: externalKey ?? target?.externalKey,
      sourceReference: normalized.sourceReference ?? target?.sourceReference,
      importIdentityKey: importIdentityKey ?? target?.importIdentityKey,
      lastImportRunId: target?.lastImportRunId,
      status,
      createdAt: target?.createdAt ?? generatedAt,
      updatedAt: generatedAt,
      archivedAt: status === 'archived' ? (target?.archivedAt ?? generatedAt) : undefined,
    });

    const assignmentPlan = planImportClassificationAssignments({
      entityId: itemId,
      existingAssignments: target ? (assignmentsByItem.get(target.id) ?? []) : [],
      resolution: classification,
      applicableFamilyIds,
      createId,
      generatedAt,
    });
    const expectedAssignments = assignmentPlan.expectedAssignments;
    const assignmentsToDelete = assignmentPlan.assignmentsToDelete;
    const assignmentsToCreate = assignmentPlan.assignmentsToCreate;
    const desiredFormatId = assignmentPlan.desiredCategoryValueIdsByFamily['resource-format']?.[0];
    const currentClassificationSnapshot = classificationSession.snapshot();
    const lifecycleIds = new Set([
      ...currentClassificationSnapshot.newCategoryValues.map((value) => value.id),
      ...currentClassificationSnapshot.restoredCategoryValues.map((value) => value.after.id),
    ]);
    const categoryLifecycleChange = assignmentPlan.desiredCategoryValueIds.some((id) =>
      lifecycleIds.has(id),
    );

    const itemChanged = !target || !sameRecord(withoutRun, target);
    const assignmentChanged = assignmentsToDelete.length > 0 || assignmentsToCreate.length > 0;
    if (target && !itemChanged && !assignmentChanged && !categoryLifecycleChange) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'skip',
        reasons: ['The stable Resource identity already has the same reviewed values.'],
        normalized,
        duplicateReview,
        planned: {
          normalized,
          existingItem: target,
          expectedAssignments,
          assignmentsToDelete: [],
          assignmentsToCreate: [],
          resourceFormatValueId: desiredFormatId,
          duplicateReview,
          classificationReviews: [],
          sourceReview: normalized.sourceReview,
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
          ? 'The reviewed stable identity or explicit duplicate decision updates this Resource.'
          : 'No strong existing identity was selected; create a new Resource.',
        ...(assignmentChanged ? ['Apply the reviewed Library classification assignments.'] : []),
      ],
      normalized,
      duplicateReview,
      classificationReviews: [],
      sourceReview: normalized.sourceReview,
      planned: {
        normalized,
        item,
        existingItem: target,
        expectedAssignments,
        assignmentsToDelete,
        assignmentsToCreate,
        resourceFormatValueId: desiredFormatId,
        duplicateReview,
        classificationReviews: [],
        sourceReview: normalized.sourceReview,
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
      formatDecisions: input.formatDecisions,
      classificationDecisions: input.classificationDecisions,
      sourceDecisions: input.sourceDecisions,
    },
    generatedAt,
  );

  const classificationSnapshot = classificationSession.snapshot();
  return {
    ...genericPreview,
    importRunId,
    rows,
    defaults: {
      externalSource: optional(normalizeImportText(input.defaults.externalSource ?? '')),
      sourceReference: optional(normalizeImportText(input.defaults.sourceReference ?? '')),
    },
    newCategoryValues: classificationSnapshot.newCategoryValues,
    restoredCategoryValues: classificationSnapshot.restoredCategoryValues,
    expectedCategoryValues: classificationSnapshot.expectedCategoryValues,
    formatReviews: classificationSnapshot.classificationReviews.filter(
      (review) => review.familyId === 'resource-format',
    ),
    classificationReviews: classificationSnapshot.classificationReviews,
    classificationAudit: classificationSnapshot.classificationAudit,
  };
}
