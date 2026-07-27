import type { StudentRecord } from '@/domain/models/entities';

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
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const HEADER_ALIASES = {
  name: ['name', 'studentname', 'fullname', 'student', '姓名', '学生姓名'],
  preferredName: ['preferredname', 'preferred', 'nickname', '常用名', '昵称'],
  role: ['role', 'rosternote', 'membershiprole', '角色', '名册备注'],
  notes: ['notes', 'studentnotes', 'note', '备注', '学生备注'],
} as const;

function normalizeHeader(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en')
    .replace(/[\s_\-–—/]+/g, '');
}

export function normalizeStudentImportName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function findColumn(headers: string[], aliases: readonly string[]): number {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((header) => normalizedAliases.has(header));
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error ?? new Error('The roster file could not be read.'));
    };
    reader.onabort = () => {
      reject(new Error('Reading the roster file was canceled.'));
    };
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('The roster CSV file could not be read as text.'));
        return;
      }
      resolve(reader.result);
    };

    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error ?? new Error('The roster file could not be read.'));
    };
    reader.onabort = () => {
      reject(new Error('Reading the roster file was canceled.'));
    };
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error('The roster Excel file could not be read as binary data.'));
        return;
      }
      resolve(reader.result);
    };

    reader.readAsArrayBuffer(file);
  });
}

async function loadSheetRows(file: File): Promise<unknown[][]> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error('Choose a roster file smaller than 5 MB.');
  }

  const extension = file.name.split('.').pop()?.toLocaleLowerCase('en');
  if (!extension || !['csv', 'xlsx', 'xls'].includes(extension)) {
    throw new Error('Choose a CSV or Excel (.xlsx or .xls) roster file.');
  }

  const XLSX = await import('xlsx');
  const workbook =
    extension === 'csv'
      ? XLSX.read(await readFileAsText(file), { type: 'string' })
      : XLSX.read(await readFileAsArrayBuffer(file), { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('The roster file has no worksheets.');
  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) throw new Error('The first worksheet could not be read.');

  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false,
  }) as unknown[][];
}

export async function parseRosterImportFile(file: File): Promise<ParsedRosterImportRow[]> {
  const matrix = await loadSheetRows(file);
  const headerIndex = matrix.findIndex((row) => row.some((cell) => cellText(cell)));
  if (headerIndex < 0) throw new Error('The roster file is empty.');

  const headers = matrix[headerIndex]?.map((value) => normalizeHeader(cellText(value))) ?? [];
  const nameColumn = findColumn(headers, HEADER_ALIASES.name);
  if (nameColumn < 0) {
    throw new Error('The roster file must include a Name column.');
  }
  const preferredNameColumn = findColumn(headers, HEADER_ALIASES.preferredName);
  const roleColumn = findColumn(headers, HEADER_ALIASES.role);
  const notesColumn = findColumn(headers, HEADER_ALIASES.notes);

  const sourceRows = matrix
    .slice(headerIndex + 1)
    .map((row, index): ParsedRosterImportRow => ({
      sourceRow: headerIndex + index + 2,
      name: cellText(row[nameColumn]),
      preferredName:
        preferredNameColumn >= 0 ? cellText(row[preferredNameColumn]) || undefined : undefined,
      role: roleColumn >= 0 ? cellText(row[roleColumn]) || undefined : undefined,
      notes: notesColumn >= 0 ? cellText(row[notesColumn]) || undefined : undefined,
    }))
    .filter((row) => Boolean(row.name || row.preferredName || row.role || row.notes));

  if (sourceRows.length === 0) {
    throw new Error('The roster file has headers but no student rows.');
  }
  if (sourceRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Import at most ${MAX_IMPORT_ROWS} students at a time.`);
  }
  return sourceRows;
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
