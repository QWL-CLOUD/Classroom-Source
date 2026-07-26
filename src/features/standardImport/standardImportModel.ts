import { z } from 'zod';

import {
  standardImportBatchSchema,
  standardSchema,
  type Standard,
  type StandardImportBatch,
  type StandardStatus,
} from '@/domain/models/entities';
import {
  buildStandardFrameworkKey,
  normalizeStandardCode,
} from '@/features/standards/standardIdentity';

import type { StandardImportFileKind } from './standardImportFileParser';

export const standardImportSourceSchema = z.object({
  sourceName: z.string().trim().min(1, 'Enter a reviewed source name.').max(500),
  issuingOrganization: z
    .string()
    .trim()
    .min(1, 'Enter the publisher or issuing organization.')
    .max(240),
  frameworkTitle: z.string().trim().min(1, 'Enter the framework title.').max(500),
  jurisdiction: z.string().trim().max(240),
  version: z.string().trim().max(120),
  importNote: z.string().trim().max(5_000),
});

export type StandardImportSourceValues = z.infer<typeof standardImportSourceSchema>;

export const standardImportFieldKeys = [
  'issuingOrganization',
  'frameworkTitle',
  'jurisdiction',
  'subject',
  'gradeBand',
  'version',
  'code',
  'statement',
  'parentCode',
  'status',
  'sortOrder',
  'sourceName',
  'importNote',
] as const;

export type StandardImportFieldKey = (typeof standardImportFieldKeys)[number];
export type StandardImportColumnMapping = Record<StandardImportFieldKey, number | null>;

export const standardImportFieldLabels: Record<StandardImportFieldKey, string> = {
  issuingOrganization: 'Issuing organization',
  frameworkTitle: 'Framework title',
  jurisdiction: 'Jurisdiction or scope',
  subject: 'Subject',
  gradeBand: 'Grade band or level',
  version: 'Version or year',
  code: 'Standard code',
  statement: 'Standard statement',
  parentCode: 'Parent code',
  status: 'Status',
  sortOrder: 'Sort order',
  sourceName: 'Source name',
  importNote: 'Import note',
};

export interface StandardImportTable {
  headerRowNumber: number;
  headers: string[];
  rows: StandardImportTableRow[];
}

export interface StandardImportTableRow {
  rowNumber: number;
  values: string[];
}

export type StandardImportClassification =
  | 'valid-new'
  | 'exact-duplicate'
  | 'reviewed-update'
  | 'invalid'
  | 'unresolved-parent'
  | 'hierarchy-conflict'
  | 'identity-conflict';

export const standardImportClassificationLabels: Record<StandardImportClassification, string> = {
  'valid-new': 'Valid new Standard',
  'exact-duplicate': 'Exact duplicate',
  'reviewed-update': 'Reviewed update',
  invalid: 'Invalid row',
  'unresolved-parent': 'Unresolved parent',
  'hierarchy-conflict': 'Hierarchy conflict',
  'identity-conflict': 'Identity conflict',
};

export interface StandardImportPreviewRow {
  rowNumber: number;
  classification: StandardImportClassification;
  reason: string;
  code: string;
  statement: string;
  parentCode?: string;
  frameworkLabel: string;
  existingStandard?: Standard;
  plannedStandard?: Standard;
}

export interface StandardImportPreviewSummary {
  total: number;
  newCount: number;
  duplicateCount: number;
  updateCount: number;
  invalidCount: number;
  unresolvedParentCount: number;
  hierarchyConflictCount: number;
  identityConflictCount: number;
}

export interface StandardImportPreview {
  batchId: string;
  generatedAt: string;
  source: StandardImportSourceValues;
  rows: StandardImportPreviewRow[];
  summary: StandardImportPreviewSummary;
  canCommit: boolean;
  hasChanges: boolean;
}

export interface BuildStandardImportPreviewInput {
  table: StandardImportTable;
  mapping: StandardImportColumnMapping;
  source: StandardImportSourceValues;
  existingStandards: readonly Standard[];
}

export interface StandardImportPreviewDependencies {
  createId?: () => string;
  now?: () => string;
}

interface Candidate {
  rowNumber: number;
  issuingOrganization: string;
  frameworkTitle: string;
  jurisdiction?: string;
  subject?: string;
  subjectMapped: boolean;
  gradeBand?: string;
  gradeBandMapped: boolean;
  version?: string;
  code: string;
  normalizedCode: string;
  frameworkKey: string;
  statement: string;
  parentCode?: string;
  parentMapped: boolean;
  status: StandardStatus;
  statusMapped: boolean;
  sortOrder?: number;
  sortOrderMapped: boolean;
  sourceName: string;
  importNote?: string;
  provisionalId: string;
  parseError?: string;
}

function optionalText(value: string): string | undefined {
  return value.trim() || undefined;
}

function normalizeReviewedText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, '');
}

const headerAliases: Record<StandardImportFieldKey, string[]> = {
  issuingOrganization: ['issuingorganization', 'organization', 'publisher', 'issuer'],
  frameworkTitle: ['frameworktitle', 'framework', 'standardsframework'],
  jurisdiction: ['jurisdiction', 'scope', 'state', 'region'],
  subject: ['subject', 'discipline', 'contentarea'],
  gradeBand: ['gradeband', 'grade', 'level', 'grades'],
  version: ['version', 'year', 'frameworkversion', 'adoptionyear'],
  code: ['code', 'standardcode', 'identifier', 'standardid'],
  statement: ['statement', 'standardstatement', 'description', 'text', 'expectation'],
  parentCode: ['parentcode', 'parent', 'parentstandard', 'parentidentifier'],
  status: ['status', 'lifecycle', 'state'],
  sortOrder: ['sortorder', 'order', 'sequence'],
  sourceName: ['sourcename', 'source', 'documenttitle'],
  importNote: ['importnote', 'sourcenote', 'note', 'notes'],
};

export function createEmptyColumnMapping(): StandardImportColumnMapping {
  return Object.fromEntries(
    standardImportFieldKeys.map((key) => [key, null]),
  ) as StandardImportColumnMapping;
}

export function suggestStandardImportMapping(
  headers: readonly string[],
): StandardImportColumnMapping {
  const mapping = createEmptyColumnMapping();
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const key of standardImportFieldKeys) {
    const index = normalizedHeaders.findIndex((header) => headerAliases[key].includes(header));
    if (index >= 0) mapping[key] = index;
  }
  return mapping;
}

export function buildStandardImportTable(
  rows: readonly (readonly string[])[],
): StandardImportTable {
  const headerIndex = rows.findIndex((row) => row.some((value) => value.trim()));
  if (headerIndex < 0) throw new Error('The selected worksheet contains no rows.');
  const width = Math.max(...rows.slice(headerIndex).map((row) => row.length), 1);
  const rawHeaders = Array.from({ length: width }, (_, index) =>
    normalizeReviewedText(rows[headerIndex]?.[index] ?? ''),
  );
  const used = new Map<string, number>();
  const headers = rawHeaders.map((header, index) => {
    const base = header || `Column ${index + 1}`;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
  const dataRows = rows
    .slice(headerIndex + 1)
    .map((row, index) => ({
      rowNumber: headerIndex + index + 2,
      values: Array.from({ length: width }, (_, column) => row[column] ?? ''),
    }))
    .filter((row) => row.values.some((value) => value.trim()));
  return { headerRowNumber: headerIndex + 1, headers, rows: dataRows };
}

function mappedValue(
  row: StandardImportTableRow,
  mapping: StandardImportColumnMapping,
  key: StandardImportFieldKey,
): string {
  const column = mapping[key];
  return column === null ? '' : normalizeReviewedText(row.values[column] ?? '');
}

function parseStatus(value: string): StandardStatus | undefined {
  if (!value) return undefined;
  const normalized = value.toLocaleLowerCase('en');
  if (normalized === 'active') return 'active';
  if (normalized === 'archived' || normalized === 'archive' || normalized === 'inactive') {
    return 'archived';
  }
  return undefined;
}

function candidateFromRow(
  row: StandardImportTableRow,
  mapping: StandardImportColumnMapping,
  source: StandardImportSourceValues,
  provisionalId: string,
): Candidate {
  const issuingOrganization =
    mappedValue(row, mapping, 'issuingOrganization') || source.issuingOrganization;
  const frameworkTitle = mappedValue(row, mapping, 'frameworkTitle') || source.frameworkTitle;
  const jurisdiction = optionalText(
    mappedValue(row, mapping, 'jurisdiction') || source.jurisdiction,
  );
  const version = optionalText(mappedValue(row, mapping, 'version') || source.version);
  const sourceName = mappedValue(row, mapping, 'sourceName') || source.sourceName;
  const importNote = optionalText(mappedValue(row, mapping, 'importNote') || source.importNote);
  const code = mappedValue(row, mapping, 'code');
  const statement = mappedValue(row, mapping, 'statement');
  const statusText = mappedValue(row, mapping, 'status');
  const status = parseStatus(statusText);
  const sortOrderText = mappedValue(row, mapping, 'sortOrder');
  const parsedSortOrder = sortOrderText ? Number(sortOrderText) : undefined;
  const errors: string[] = [];
  if (!code) errors.push('Standard code is required.');
  if (!statement) errors.push('Standard statement is required.');
  if (statusText && !status) errors.push('Status must be Active or Archived.');
  if (
    parsedSortOrder !== undefined &&
    (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0 || parsedSortOrder > 1_000_000)
  ) {
    errors.push('Sort order must be a whole number from 0 to 1,000,000.');
  }

  return {
    rowNumber: row.rowNumber,
    issuingOrganization,
    frameworkTitle,
    jurisdiction,
    subject: optionalText(mappedValue(row, mapping, 'subject')),
    subjectMapped: mapping.subject !== null,
    gradeBand: optionalText(mappedValue(row, mapping, 'gradeBand')),
    gradeBandMapped: mapping.gradeBand !== null,
    version,
    code,
    normalizedCode: normalizeStandardCode(code),
    frameworkKey: buildStandardFrameworkKey({
      issuingOrganization,
      frameworkTitle,
      jurisdiction,
      version,
    }),
    statement,
    parentCode: optionalText(mappedValue(row, mapping, 'parentCode')),
    parentMapped: mapping.parentCode !== null,
    status: status ?? 'active',
    statusMapped: mapping.status !== null && Boolean(statusText),
    sortOrder: parsedSortOrder,
    sortOrderMapped: mapping.sortOrder !== null && Boolean(sortOrderText),
    sourceName,
    importNote,
    provisionalId,
    parseError: errors.length > 0 ? errors.join(' ') : undefined,
  };
}

function identityKey(value: Pick<Candidate, 'frameworkKey' | 'normalizedCode'>): string {
  return `${value.frameworkKey}\u0000${value.normalizedCode}`;
}

function sameOptional(first: string | undefined, second: string | undefined): boolean {
  return (first ?? '') === (second ?? '');
}

function isExactDuplicate(existing: Standard, planned: Standard): boolean {
  return (
    existing.issuingOrganization === planned.issuingOrganization &&
    existing.frameworkTitle === planned.frameworkTitle &&
    sameOptional(existing.jurisdiction, planned.jurisdiction) &&
    sameOptional(existing.subject, planned.subject) &&
    sameOptional(existing.gradeBand, planned.gradeBand) &&
    sameOptional(existing.version, planned.version) &&
    existing.code === planned.code &&
    existing.statement === planned.statement &&
    sameOptional(existing.parentStandardId, planned.parentStandardId) &&
    existing.sortOrder === planned.sortOrder &&
    existing.status === planned.status &&
    sameOptional(existing.sourceName, planned.sourceName) &&
    sameOptional(existing.importNote, planned.importNote)
  );
}

function describeChanges(existing: Standard, planned: Standard): string {
  const fields: string[] = [];
  if (existing.statement !== planned.statement) fields.push('statement');
  if (!sameOptional(existing.subject, planned.subject)) fields.push('subject');
  if (!sameOptional(existing.gradeBand, planned.gradeBand)) fields.push('grade band');
  if (!sameOptional(existing.parentStandardId, planned.parentStandardId)) fields.push('parent');
  if (existing.status !== planned.status) fields.push('status');
  if (existing.sortOrder !== planned.sortOrder) fields.push('sort order');
  if (!sameOptional(existing.sourceName, planned.sourceName)) fields.push('source');
  if (!sameOptional(existing.importNote, planned.importNote)) fields.push('source note');
  return fields.length > 0 ? fields.join(', ') : 'reviewed metadata';
}

function makeSummary(rows: readonly StandardImportPreviewRow[]): StandardImportPreviewSummary {
  const count = (classification: StandardImportClassification) =>
    rows.filter((row) => row.classification === classification).length;
  return {
    total: rows.length,
    newCount: count('valid-new'),
    duplicateCount: count('exact-duplicate'),
    updateCount: count('reviewed-update'),
    invalidCount: count('invalid'),
    unresolvedParentCount: count('unresolved-parent'),
    hierarchyConflictCount: count('hierarchy-conflict'),
    identityConflictCount: count('identity-conflict'),
  };
}

function frameworkLabel(candidate: Candidate): string {
  return [candidate.frameworkTitle, candidate.jurisdiction, candidate.version]
    .filter(Boolean)
    .join(' · ');
}

function plannedStandard(
  candidate: Candidate,
  existing: Standard | undefined,
  batchId: string,
  generatedAt: string,
): Standard {
  const status = candidate.statusMapped ? candidate.status : (existing?.status ?? candidate.status);
  return standardSchema.parse({
    id: existing?.id ?? candidate.provisionalId,
    issuingOrganization: candidate.issuingOrganization,
    frameworkTitle: candidate.frameworkTitle,
    jurisdiction: candidate.jurisdiction,
    subject: candidate.subjectMapped ? candidate.subject : existing?.subject,
    gradeBand: candidate.gradeBandMapped ? candidate.gradeBand : existing?.gradeBand,
    version: candidate.version,
    frameworkKey: candidate.frameworkKey,
    code: candidate.code,
    normalizedCode: candidate.normalizedCode,
    statement: candidate.statement,
    parentStandardId: candidate.parentMapped ? undefined : existing?.parentStandardId,
    sortOrder: candidate.sortOrderMapped ? (candidate.sortOrder ?? 0) : (existing?.sortOrder ?? 0),
    status,
    sourceName: candidate.sourceName,
    importNote: candidate.importNote,
    importBatchId: batchId,
    createdAt: existing?.createdAt ?? generatedAt,
    updatedAt: generatedAt,
    archivedAt: status === 'archived' ? (existing?.archivedAt ?? generatedAt) : undefined,
  });
}

function wouldCreateCycle(
  standard: Standard,
  standardsById: ReadonlyMap<string, Standard>,
): boolean {
  const visited = new Set<string>([standard.id]);
  let cursorId = standard.parentStandardId;
  while (cursorId) {
    if (visited.has(cursorId)) return true;
    visited.add(cursorId);
    cursorId = standardsById.get(cursorId)?.parentStandardId;
  }
  return false;
}

export function buildStandardImportPreview(
  input: BuildStandardImportPreviewInput,
  dependencies: StandardImportPreviewDependencies = {},
): StandardImportPreview {
  const source = standardImportSourceSchema.parse(input.source);
  if (input.mapping.code === null || input.mapping.statement === null) {
    throw new Error('Map both Standard code and Standard statement before previewing.');
  }
  if (input.table.rows.length === 0) throw new Error('The selected table contains no data rows.');

  const createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
  const generatedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  const batchId = createId();
  const candidates = input.table.rows.map((row) =>
    candidateFromRow(row, input.mapping, source, createId()),
  );
  const existing = input.existingStandards.map((value) => standardSchema.parse(value));
  const existingByIdentity = new Map(
    existing.map((value) => [`${value.frameworkKey}\u0000${value.normalizedCode}`, value]),
  );
  const candidatesByIdentity = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = identityKey(candidate);
    candidatesByIdentity.set(key, [...(candidatesByIdentity.get(key) ?? []), candidate]);
  }

  const rows: StandardImportPreviewRow[] = [];
  const plannedByCandidate = new Map<Candidate, Standard>();
  for (const candidate of candidates) {
    const base = {
      rowNumber: candidate.rowNumber,
      code: candidate.code,
      statement: candidate.statement,
      parentCode: candidate.parentCode,
      frameworkLabel: frameworkLabel(candidate),
    };
    if (candidate.parseError) {
      rows.push({ ...base, classification: 'invalid', reason: candidate.parseError });
      continue;
    }
    if ((candidatesByIdentity.get(identityKey(candidate))?.length ?? 0) > 1) {
      rows.push({
        ...base,
        classification: 'identity-conflict',
        reason: 'More than one import row uses this framework and normalized Standard code.',
      });
      continue;
    }
    const existingStandard = existingByIdentity.get(identityKey(candidate));
    try {
      const planned = plannedStandard(candidate, existingStandard, batchId, generatedAt);
      plannedByCandidate.set(candidate, planned);
      rows.push({
        ...base,
        existingStandard,
        plannedStandard: planned,
        classification: existingStandard ? 'reviewed-update' : 'valid-new',
        reason: existingStandard
          ? 'Existing identity found; review the proposed field changes.'
          : 'The framework identity and required fields are valid.',
      });
    } catch (cause) {
      rows.push({
        ...base,
        classification: 'invalid',
        reason: cause instanceof Error ? cause.message : 'The row is not a valid Standard.',
      });
    }
  }

  const plannedIdentity = new Map<string, Standard>();
  for (const [candidate, planned] of plannedByCandidate) {
    plannedIdentity.set(identityKey(candidate), planned);
  }
  const allById = new Map(existing.map((value) => [value.id, value]));
  for (const planned of plannedByCandidate.values()) allById.set(planned.id, planned);

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const candidate = candidates[index];
    if (!row || !candidate) continue;
    let planned = row.plannedStandard;
    if (!planned) continue;

    if (candidate.parentMapped && candidate.parentCode) {
      const parentKey = `${candidate.frameworkKey}\u0000${normalizeStandardCode(candidate.parentCode)}`;
      const parent = plannedIdentity.get(parentKey) ?? existingByIdentity.get(parentKey);
      if (!parent) {
        rows[index] = {
          ...row,
          classification: 'unresolved-parent',
          reason: `Parent code “${candidate.parentCode}” was not found in this framework.`,
        };
        continue;
      }
      if (parent.id === planned.id) {
        rows[index] = {
          ...row,
          classification: 'hierarchy-conflict',
          reason: 'A Standard cannot be its own parent.',
        };
        continue;
      }
      if (parent.status === 'archived' && row.existingStandard?.parentStandardId !== parent.id) {
        rows[index] = {
          ...row,
          classification: 'hierarchy-conflict',
          reason: 'An archived Standard cannot be selected as a new parent.',
        };
        continue;
      }
      planned = standardSchema.parse({ ...planned, parentStandardId: parent.id });
      rows[index] = { ...row, plannedStandard: planned };
      plannedByCandidate.set(candidate, planned);
      allById.set(planned.id, planned);
    } else if (candidate.parentMapped && !candidate.parentCode) {
      planned = standardSchema.parse({ ...planned, parentStandardId: undefined });
      rows[index] = { ...row, plannedStandard: planned };
      plannedByCandidate.set(candidate, planned);
      allById.set(planned.id, planned);
    }
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    const planned = row.plannedStandard;
    if (!planned || !['valid-new', 'reviewed-update'].includes(row.classification)) continue;
    if (wouldCreateCycle(planned, allById)) {
      rows[index] = {
        ...row,
        classification: 'hierarchy-conflict',
        reason: 'This parent assignment would create a Standard hierarchy cycle.',
      };
      continue;
    }
    if (row.existingStandard && isExactDuplicate(row.existingStandard, planned)) {
      rows[index] = {
        ...row,
        classification: 'exact-duplicate',
        reason: 'The existing Standard already matches all reviewed import fields.',
      };
    } else if (row.existingStandard) {
      rows[index] = {
        ...row,
        classification: 'reviewed-update',
        reason: `Reviewed changes: ${describeChanges(row.existingStandard, planned)}.`,
      };
    }
  }

  const summary = makeSummary(rows);
  const blocked =
    summary.invalidCount +
    summary.unresolvedParentCount +
    summary.hierarchyConflictCount +
    summary.identityConflictCount;
  const hasChanges = summary.newCount + summary.updateCount > 0;
  return {
    batchId,
    generatedAt,
    source,
    rows,
    summary,
    canCommit: blocked === 0 && hasChanges,
    hasChanges,
  };
}

export function buildStandardImportBatch(
  preview: StandardImportPreview,
  fileKind: StandardImportFileKind,
  worksheetName: string,
): StandardImportBatch {
  return standardImportBatchSchema.parse({
    id: preview.batchId,
    sourceName: preview.source.sourceName,
    issuingOrganization: preview.source.issuingOrganization,
    frameworkTitle: preview.source.frameworkTitle,
    jurisdiction: optionalText(preview.source.jurisdiction),
    version: optionalText(preview.source.version),
    importNote: optionalText(preview.source.importNote),
    worksheetName,
    fileKind,
    totalRows: preview.summary.total,
    createdCount: preview.summary.newCount,
    updatedCount: preview.summary.updateCount,
    duplicateCount: preview.summary.duplicateCount,
    createdAt: preview.generatedAt,
  });
}
