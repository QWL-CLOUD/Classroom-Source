import type { StudentRecord } from '@/domain/models/entities';
import {
  MAX_IMPORT_FILE_BYTES,
  parseImportFile,
  parsePastedImportTable,
} from '@/features/importCenter/importSourceAdapters';
import {
  buildImportTable,
  normalizeImportHeader,
  normalizeImportText,
} from '@/features/importCenter/importTableModel';
import type { ImportWorkbook } from '@/features/importCenter/importTypes';

import type { RosterImportItem } from './rosterMutationService';

export type RosterImportDecision = 'create' | 'reuse' | 'skip';
export type RosterImportStatus =
  | 'new'
  | 'existing'
  | 'already-in-roster'
  | 'archived'
  | 'ambiguous'
  | 'duplicate-file'
  | 'invalid';

export type RosterImportWorkbook = ImportWorkbook & {
  kind: 'csv' | 'xlsx' | 'paste-table';
};

export interface ParsedRosterImportRow {
  sourceRow: number;
  name: string;
  preferredName?: string;
  role?: string;
  notes?: string;
}

export interface RosterImportPreviewRow extends ParsedRosterImportRow {
  key: string;
  status: RosterImportStatus;
  decision: RosterImportDecision;
  existingStudentId?: string;
  message: string;
}

const MAX_IMPORT_ROWS = 500;

const HEADER_ALIASES = {
  name: ['name', 'studentname', 'fullname', 'student', '姓名', '学生姓名'],
  preferredName: ['preferredname', 'preferred', 'nickname', '常用名', '昵称'],
  role: ['role', 'rosternote', 'membershiprole', '角色', '名册备注'],
  notes: ['notes', 'studentnotes', 'note', '备注', '学生备注'],
} as const;

function findColumn(headers: readonly string[], aliases: readonly string[]): number {
  const normalizedAliases = new Set(aliases.map(normalizeImportHeader));
  return headers.findIndex((header) => normalizedAliases.has(normalizeImportHeader(header)));
}

function optionalCell(value: string): string | undefined {
  const normalized = normalizeImportText(value);
  return normalized || undefined;
}

export function normalizeStudentImportName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

export async function parseRosterImportFile(file: File): Promise<RosterImportWorkbook> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('Choose a CSV or XLSX roster file no larger than 20 MB.');
  }
  const extension = file.name.split('.').at(-1)?.toLocaleLowerCase('en');
  if (extension !== 'csv' && extension !== 'xlsx') {
    throw new Error('Choose a .csv or .xlsx roster file.');
  }
  const workbook = await parseImportFile(file);
  if (workbook.kind !== 'csv' && workbook.kind !== 'xlsx') {
    throw new Error('Choose a .csv or .xlsx roster file.');
  }
  return { ...workbook, kind: workbook.kind };
}

export function parseRosterImportPastedTable(text: string): RosterImportWorkbook {
  const workbook = parsePastedImportTable(text);
  return { ...workbook, kind: 'paste-table' };
}

export function parseRosterImportWorksheet(
  matrix: readonly (readonly string[])[],
): ParsedRosterImportRow[] {
  const table = buildImportTable(matrix);
  const nameColumn = findColumn(table.headers, HEADER_ALIASES.name);
  if (nameColumn < 0) throw new Error('The roster worksheet must include a Name column.');
  const preferredNameColumn = findColumn(table.headers, HEADER_ALIASES.preferredName);
  const roleColumn = findColumn(table.headers, HEADER_ALIASES.role);
  const notesColumn = findColumn(table.headers, HEADER_ALIASES.notes);

  const rows = table.rows
    .map((row): ParsedRosterImportRow => ({
      sourceRow: row.sourceRow,
      name: normalizeImportText(row.values[nameColumn] ?? ''),
      preferredName:
        preferredNameColumn >= 0 ? optionalCell(row.values[preferredNameColumn] ?? '') : undefined,
      role: roleColumn >= 0 ? optionalCell(row.values[roleColumn] ?? '') : undefined,
      notes: notesColumn >= 0 ? optionalCell(row.values[notesColumn] ?? '') : undefined,
    }))
    .filter((row) => Boolean(row.name || row.preferredName || row.role || row.notes));

  if (rows.length === 0) throw new Error('The roster worksheet has headers but no student rows.');
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Import at most ${MAX_IMPORT_ROWS} students at a time.`);
  }
  return rows;
}

export function buildRosterImportPreview(
  rows: readonly ParsedRosterImportRow[],
  students: readonly StudentRecord[],
  memberStudentIds: ReadonlySet<string>,
): RosterImportPreviewRow[] {
  const studentsByName = new Map<string, StudentRecord[]>();
  for (const student of students) {
    const key = normalizeStudentImportName(student.name);
    const matches = studentsByName.get(key) ?? [];
    matches.push(student);
    studentsByName.set(key, matches);
  }

  const seenNames = new Set<string>();
  return rows.map((row, index) => {
    const key = normalizeStudentImportName(row.name);
    const base = { ...row, key: `${row.sourceRow}-${index}-${key}` };
    if (!key) {
      return {
        ...base,
        status: 'invalid',
        decision: 'skip',
        message: 'Enter a student name.',
      };
    }
    if (seenNames.has(key)) {
      return {
        ...base,
        status: 'duplicate-file',
        decision: 'skip',
        message: 'Duplicate Name in this import file.',
      };
    }
    seenNames.add(key);

    const matches = studentsByName.get(key) ?? [];
    const alreadyInRoster = matches.find((student) => memberStudentIds.has(student.id));
    if (alreadyInRoster) {
      return {
        ...base,
        status: 'already-in-roster',
        decision: 'skip',
        existingStudentId: alreadyInRoster.id,
        message: 'This Student is already in the selected roster.',
      };
    }

    const activeMatches = matches.filter((student) => student.status === 'active');
    if (activeMatches.length === 1) {
      return {
        ...base,
        status: 'existing',
        decision: 'reuse',
        existingStudentId: activeMatches[0]?.id,
        message: 'Reuse the existing active Student record.',
      };
    }
    if (activeMatches.length > 1) {
      return {
        ...base,
        status: 'ambiguous',
        decision: 'skip',
        message: 'Multiple active Students have this Name. Resolve them manually.',
      };
    }
    if (matches.some((student) => student.status === 'archived')) {
      return {
        ...base,
        status: 'archived',
        decision: 'skip',
        message: 'An archived Student has this Name. Restore that record first.',
      };
    }

    return {
      ...base,
      status: 'new',
      decision: 'create',
      message: 'Create a new Student record and add it to this roster.',
    };
  });
}

export function toRosterImportItems(rows: readonly RosterImportPreviewRow[]): RosterImportItem[] {
  return rows.flatMap((row): RosterImportItem[] => {
    if (row.decision === 'reuse' && row.existingStudentId) {
      return [
        {
          kind: 'existing',
          studentId: row.existingStudentId,
          role: row.role,
        },
      ];
    }
    if (row.decision === 'create') {
      return [
        {
          kind: 'new',
          student: {
            name: row.name,
            preferredName: row.preferredName,
            notes: row.notes,
          },
          role: row.role,
        },
      ];
    }
    return [];
  });
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

const TEMPLATE_ROWS = [
  {
    Name: 'Amy Chen',
    'Preferred Name': 'Amy',
    Role: 'Student',
    Notes: '',
  },
  {
    Name: 'Ben Lee',
    'Preferred Name': '',
    Role: 'Student',
    Notes: 'Reading support',
  },
];

export async function downloadRosterImportTemplate(format: 'csv' | 'xlsx'): Promise<void> {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(TEMPLATE_ROWS);
  if (format === 'csv') {
    downloadBlob(
      new Blob([XLSX.utils.sheet_to_csv(worksheet)], {
        type: 'text/csv;charset=utf-8',
      }),
      'Classroom-Roster-Import-Template.csv',
    );
    return;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Roster Import');
  const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  downloadBlob(
    new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'Classroom-Roster-Import-Template.xlsx',
  );
}
