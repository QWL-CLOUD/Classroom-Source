import * as XLSX from 'xlsx';

import type { ImportWorkbook, ImportWorksheet } from './importTypes';

export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5_000;
const MAX_UNCOMPRESSED_ENTRY_BYTES = 40 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
const MAX_WORKSHEET_ROWS = 50_000;
const MAX_WORKSHEET_COLUMNS = 500;
const MAX_WORKSHEETS = 250;

function trimTrailingEmptyRows(rows: string[][]): string[][] {
  const normalized = rows.map((row) => row.map((value) => value.trimEnd()));
  while (normalized.length > 0 && normalized.at(-1)?.every((value) => !value.trim())) {
    normalized.pop();
  }
  return normalized;
}

function countDelimiter(text: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiter(text: string): string {
  const sample = text.slice(0, 32_000);
  const candidates = [',', '\t', ';'];
  return (
    candidates
      .map((delimiter) => ({ delimiter, count: countDelimiter(sample, delimiter) }))
      .sort((first, second) => second.count - first.count)[0]?.delimiter ?? ','
  );
}

function validateWorksheetRows(rows: readonly (readonly string[])[], label: string): void {
  if (rows.length > MAX_WORKSHEET_ROWS) {
    throw new Error(`${label} exceeds ${MAX_WORKSHEET_ROWS.toLocaleString('en-US')} rows.`);
  }
  const width = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  if (width > MAX_WORKSHEET_COLUMNS) {
    throw new Error(`${label} exceeds ${MAX_WORKSHEET_COLUMNS} columns.`);
  }
}

export function parseDelimitedText(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  let fieldStarted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        value += character;
      }
      continue;
    }

    if (character === '"' && value.length === 0) {
      quoted = true;
      fieldStarted = true;
    } else if (character === delimiter) {
      row.push(value);
      value = '';
      fieldStarted = false;
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      if (row.length === 0 && !fieldStarted && value.length === 0) rows.push([]);
      else {
        row.push(value);
        rows.push(row);
      }
      row = [];
      value = '';
      fieldStarted = false;
    } else {
      value += character;
      fieldStarted = true;
    }
  }

  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  if (fieldStarted || value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  const normalized = trimTrailingEmptyRows(rows);
  validateWorksheetRows(normalized, 'The delimited source');
  return normalized;
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(view: DataView): number {
  if (view.byteLength < 22) {
    throw new Error('This XLSX file is too small to contain a ZIP directory.');
  }
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) return offset;
  }
  throw new Error('This XLSX file does not contain a readable ZIP directory.');
}

function validateXlsxZipDirectory(buffer: ArrayBuffer): void {
  const view = new DataView(buffer);
  const endOffset = findEndOfCentralDirectory(view);
  const entryCount = readUint16(view, endOffset + 10);
  const centralDirectorySize = readUint32(view, endOffset + 12);
  const centralDirectoryOffset = readUint32(view, endOffset + 16);

  if (entryCount === 0 || entryCount > MAX_ZIP_ENTRIES) {
    throw new Error('This workbook contains an unsupported number of ZIP entries.');
  }
  if (
    centralDirectoryOffset > endOffset ||
    centralDirectoryOffset + centralDirectorySize > endOffset
  ) {
    throw new Error('This XLSX file has an invalid ZIP directory offset.');
  }

  const decoder = new TextDecoder();
  let offset = centralDirectoryOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > view.byteLength || readUint32(view, offset) !== 0x02014b50) {
      throw new Error('This XLSX file has an invalid ZIP directory entry.');
    }

    const flags = readUint16(view, offset + 8);
    if ((flags & 0x1) !== 0) {
      throw new Error('Password-protected XLSX files are not supported.');
    }

    const compressionMethod = readUint16(view, offset + 10);
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error(`Unsupported XLSX compression method: ${compressionMethod}.`);
    }

    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;

    if (nameEnd > view.byteLength) {
      throw new Error('This XLSX file has a truncated ZIP entry.');
    }
    const name = decoder.decode(new Uint8Array(buffer, nameStart, fileNameLength));
    if (name.startsWith('/') || name.split('/').includes('..')) {
      throw new Error('This XLSX file contains an unsafe ZIP entry path.');
    }
    if (uncompressedSize > MAX_UNCOMPRESSED_ENTRY_BYTES) {
      throw new Error('A workbook entry is too large to review safely.');
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error('The expanded workbook is too large to review safely.');
    }

    if (
      localHeaderOffset + 30 > view.byteLength ||
      readUint32(view, localHeaderOffset) !== 0x04034b50
    ) {
      throw new Error('This XLSX file has an invalid local ZIP entry.');
    }
    const localNameLength = readUint16(view, localHeaderOffset + 26);
    const localExtraLength = readUint16(view, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + compressedSize > view.byteLength) {
      throw new Error('This XLSX file has truncated worksheet data.');
    }

    offset = nameEnd + extraLength + commentLength;
  }
}

export async function parseXlsxArrayBuffer(buffer: ArrayBuffer): Promise<ImportWorkbook> {
  validateXlsxZipDirectory(buffer);

  let workbook: ReturnType<typeof XLSX.read>;
  try {
    workbook = XLSX.read(new Uint8Array(buffer), {
      type: 'array',
      dense: true,
      cellDates: false,
      cellFormula: false,
      cellHTML: false,
      cellNF: false,
      cellStyles: false,
      bookVBA: false,
      WTF: false,
    });
  } catch {
    throw new Error('This XLSX file could not be parsed safely.');
  }

  if (workbook.SheetNames.length === 0) {
    throw new Error('The XLSX file contains no worksheets.');
  }
  if (workbook.SheetNames.length > MAX_WORKSHEETS) {
    throw new Error(`The XLSX file exceeds ${MAX_WORKSHEETS} worksheets.`);
  }

  const worksheets: ImportWorksheet[] = workbook.SheetNames.map((name, index) => {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) {
      throw new Error(`The worksheet “${name}” is not readable.`);
    }
    const rawRows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
    }) as unknown[][];
    const rows = trimTrailingEmptyRows(
      rawRows.map((row) => (Array.isArray(row) ? row.map(cellText) : [])),
    );
    validateWorksheetRows(rows, `Worksheet “${name}”`);
    return {
      id: `xlsx-${index + 1}`,
      name: name.trim() || `Worksheet ${index + 1}`,
      rows,
    };
  });

  return { kind: 'xlsx', worksheets, diagnostics: [] };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}

function matrixFromJsonRows(value: unknown, label: string): string[][] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  if (value.length === 0) return [];
  if (value.every((row) => Array.isArray(row))) {
    const rows = value.map((row) => (row as unknown[]).map(cellText));
    validateWorksheetRows(rows, label);
    return trimTrailingEmptyRows(rows);
  }
  if (value.every((row) => typeof row === 'object' && row !== null && !Array.isArray(row))) {
    const headers: string[] = [];
    const seen = new Set<string>();
    for (const record of value as Record<string, unknown>[]) {
      for (const key of Object.keys(record)) {
        if (!seen.has(key)) {
          seen.add(key);
          headers.push(key);
        }
      }
    }
    if (headers.length === 0) throw new Error(`${label} contains no fields.`);
    const rows = [
      headers,
      ...(value as Record<string, unknown>[]).map((record) =>
        headers.map((header) => cellText(record[header])),
      ),
    ];
    validateWorksheetRows(rows, label);
    return rows;
  }
  throw new Error(`${label} must contain only arrays or only objects.`);
}

export function parseJsonImportText(text: string): ImportWorkbook {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('The JSON source is not valid JSON.');
  }

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.sheets)) {
      const worksheets = record.sheets.map((sheet, index): ImportWorksheet => {
        if (typeof sheet !== 'object' || sheet === null || Array.isArray(sheet)) {
          throw new Error(`JSON worksheet ${index + 1} is not an object.`);
        }
        const sheetRecord = sheet as Record<string, unknown>;
        const name =
          typeof sheetRecord.name === 'string' && sheetRecord.name.trim()
            ? sheetRecord.name.trim()
            : `Worksheet ${index + 1}`;
        return {
          id:
            typeof sheetRecord.id === 'string' && sheetRecord.id
              ? sheetRecord.id
              : `json-${index + 1}`,
          name,
          rows: matrixFromJsonRows(sheetRecord.rows, `JSON worksheet “${name}”`),
        };
      });
      if (worksheets.length === 0) throw new Error('The JSON source contains no worksheets.');
      if (worksheets.length > MAX_WORKSHEETS) {
        throw new Error(`The JSON source exceeds ${MAX_WORKSHEETS} worksheets.`);
      }
      return { kind: 'json', worksheets, diagnostics: [] };
    }
    if ('rows' in record) {
      const rows = matrixFromJsonRows(record.rows, 'The JSON rows');
      if (rows.length === 0) throw new Error('The JSON source contains no rows.');
      return {
        kind: 'json',
        worksheets: [{ id: 'json-data', name: 'JSON data', rows }],
        diagnostics: [],
      };
    }
  }

  const rows = matrixFromJsonRows(parsed, 'The JSON source');
  if (rows.length === 0) throw new Error('The JSON source contains no rows.');
  return {
    kind: 'json',
    worksheets: [{ id: 'json-data', name: 'JSON data', rows }],
    diagnostics: [],
  };
}

export function parsePastedImportTable(text: string): ImportWorkbook {
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new Error('The pasted table is too large to review safely.');
  }
  const rows = parseDelimitedText(text);
  if (rows.length === 0) throw new Error('The pasted table contains no rows.');
  return {
    kind: 'paste-table',
    worksheets: [{ id: 'pasted-table', name: 'Pasted table', rows }],
    diagnostics: [],
  };
}

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read “${file.name}”.`));
    reader.onabort = () => reject(new Error(`Reading “${file.name}” was cancelled.`));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`Could not read “${file.name}” as text.`));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read “${file.name}”.`));
    reader.onabort = () => reject(new Error(`Reading “${file.name}” was cancelled.`));
    reader.onload = () => {
      const result = reader.result;
      if (result === null || typeof result === 'string') {
        reject(new Error(`Could not read “${file.name}” as binary data.`));
        return;
      }
      resolve(result);
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function parseImportFile(file: File): Promise<ImportWorkbook> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('Choose a CSV, XLSX, or JSON file no larger than 20 MB.');
  }
  const extension = file.name.split('.').at(-1)?.toLocaleLowerCase('en');
  if (extension === 'csv') {
    const rows = parseDelimitedText(await readFileAsText(file));
    if (rows.length === 0) throw new Error('The CSV file contains no rows.');
    return {
      kind: 'csv',
      worksheets: [{ id: 'csv-data', name: 'CSV data', rows }],
      diagnostics: [],
      sourceLabel: file.name,
    };
  }
  if (extension === 'xlsx') {
    const workbook = await parseXlsxArrayBuffer(await readFileAsArrayBuffer(file));
    return { ...workbook, sourceLabel: file.name };
  }
  if (extension === 'json') {
    const workbook = parseJsonImportText(await readFileAsText(file));
    return { ...workbook, sourceLabel: file.name };
  }
  throw new Error('Choose a .csv, .xlsx, or .json file.');
}
