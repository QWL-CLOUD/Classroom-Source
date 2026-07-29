import type { ImportRun } from '@/domain/models/entities';

export const importTypes = [
  'roster',
  'standards',
  'activities',
  'resources',
  'assessments',
] as const;

export type ImportType = (typeof importTypes)[number];

export const importSourceKinds = [
  'csv',
  'xlsx',
  'json',
  'paste-table',
  'paste-url',
  'file-metadata',
] as const;

export type ImportSourceKind = (typeof importSourceKinds)[number];
export type ImportFileKind = Extract<ImportSourceKind, 'csv' | 'xlsx' | 'json'>;

export type ImportDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface ImportDiagnostic {
  severity: ImportDiagnosticSeverity;
  message: string;
  worksheetName?: string;
  sourceRow?: number;
  sourceColumn?: number;
}

export interface ImportWorksheet {
  id: string;
  name: string;
  rows: string[][];
}

export interface ImportWorkbook {
  kind: ImportSourceKind;
  sourceLabel?: string;
  worksheets: ImportWorksheet[];
  diagnostics: ImportDiagnostic[];
}

export interface ImportSourceAdapter<TSource> {
  readonly kind: ImportSourceKind;
  read(source: TSource): Promise<ImportWorkbook>;
}

export interface ImportHistoryEntry {
  id: string;
  importType: ImportType;
  sourceKind: ImportSourceKind;
  sourceLabel?: string;
  worksheetName?: string;
  contextId?: string;
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  reviewCount: number;
  blockedCount: number;
  committedAt: string;
  origin: 'canonical' | 'legacy-standard-batch';
  record?: ImportRun;
}
