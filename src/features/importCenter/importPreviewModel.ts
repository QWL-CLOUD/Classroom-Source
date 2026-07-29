export const importRowClassifications = ['create', 'update', 'skip', 'review', 'blocked'] as const;

export type ImportRowClassification = (typeof importRowClassifications)[number];

export interface ImportPreviewRow<TPlanned = unknown> {
  sourceRow: number;
  classification: ImportRowClassification;
  reasons: string[];
  planned?: TPlanned;
}

export interface ImportPreviewSummary {
  total: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  reviewCount: number;
  blockedCount: number;
}

export interface ImportPreview<TPlanned = unknown> {
  generatedAt: string;
  sourceFingerprint: string;
  rows: ImportPreviewRow<TPlanned>[];
  summary: ImportPreviewSummary;
  canCommit: boolean;
  hasChanges: boolean;
}

export function summarizeImportPreviewRows(
  rows: readonly Pick<ImportPreviewRow, 'classification'>[],
): ImportPreviewSummary {
  const summary: ImportPreviewSummary = {
    total: rows.length,
    createCount: 0,
    updateCount: 0,
    skipCount: 0,
    reviewCount: 0,
    blockedCount: 0,
  };
  for (const row of rows) {
    if (row.classification === 'create') summary.createCount += 1;
    else if (row.classification === 'update') summary.updateCount += 1;
    else if (row.classification === 'skip') summary.skipCount += 1;
    else if (row.classification === 'review') summary.reviewCount += 1;
    else summary.blockedCount += 1;
  }
  return summary;
}

export function buildImportPreview<TPlanned>(
  rows: ImportPreviewRow<TPlanned>[],
  sourceValue: unknown,
  generatedAt = new Date().toISOString(),
): ImportPreview<TPlanned> {
  const summary = summarizeImportPreviewRows(rows);
  const hasChanges = summary.createCount + summary.updateCount > 0;
  return {
    generatedAt,
    sourceFingerprint: stableImportFingerprint(sourceValue),
    rows,
    summary,
    canCommit: hasChanges && summary.reviewCount === 0 && summary.blockedCount === 0,
    hasChanges,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([first], [second]) => first.localeCompare(second, 'en'))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function stableImportFingerprint(value: unknown): string {
  const text = JSON.stringify(canonicalize(value));
  if (text === undefined) throw new Error('The import source cannot be fingerprinted.');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
