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

interface ExpansionBudget {
  usedBytes: number;
}

interface ZipEntry {
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function readUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(view: DataView): number {
  if (view.byteLength < 22)
    throw new Error('This XLSX file is too small to contain a ZIP directory.');
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (readUint32(view, offset) === 0x06054b50) return offset;
  }
  throw new Error('This XLSX file does not contain a readable ZIP directory.');
}

function readZipDirectory(buffer: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buffer);
  const endOffset = findEndOfCentralDirectory(view);
  const entryCount = readUint16(view, endOffset + 10);
  const centralDirectoryOffset = readUint32(view, endOffset + 16);
  if (centralDirectoryOffset > endOffset) {
    throw new Error('This XLSX file has an invalid ZIP directory offset.');
  }
  if (entryCount > MAX_ZIP_ENTRIES) throw new Error('This workbook contains too many ZIP entries.');

  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  let offset = centralDirectoryOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > view.byteLength || readUint32(view, offset) !== 0x02014b50) {
      throw new Error('This XLSX file has an invalid ZIP directory entry.');
    }
    const flags = readUint16(view, offset + 8);
    if ((flags & 0x1) !== 0) throw new Error('Password-protected XLSX files are not supported.');
    const compressionMethod = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const fileNameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const commentLength = readUint16(view, offset + 32);
    const localHeaderOffset = readUint32(view, offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > view.byteLength) throw new Error('This XLSX file has a truncated ZIP entry.');
    const name = decoder.decode(new Uint8Array(buffer, nameStart, fileNameLength));

    if (uncompressedSize > MAX_UNCOMPRESSED_ENTRY_BYTES) {
      throw new Error('A workbook entry is too large to review safely.');
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error('The expanded workbook is too large to review safely.');
    }

    entries.set(name.replace(/^\/+/, ''), {
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = nameEnd + extraLength + commentLength;
  }
  return entries;
}

function reserveExpandedBytes(budget: ExpansionBudget, byteLength: number): void {
  budget.usedBytes += byteLength;
  if (budget.usedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw new Error('The expanded workbook is too large to review safely.');
  }
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress XLSX files locally. Use CSV instead.');
  }
  const stream = new Blob([data.slice().buffer])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_UNCOMPRESSED_ENTRY_BYTES) {
      await reader.cancel();
      throw new Error('A workbook entry is too large to review safely.');
    }
    chunks.push(value);
  }
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function readZipEntry(
  buffer: ArrayBuffer,
  entry: ZipEntry,
  budget: ExpansionBudget,
): Promise<Uint8Array> {
  const view = new DataView(buffer);
  const offset = entry.localHeaderOffset;
  if (offset + 30 > view.byteLength || readUint32(view, offset) !== 0x04034b50) {
    throw new Error('This XLSX file has an invalid local ZIP entry.');
  }
  const fileNameLength = readUint16(view, offset + 26);
  const extraLength = readUint16(view, offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > view.byteLength) throw new Error('This XLSX file has truncated worksheet data.');
  const compressed = new Uint8Array(buffer, dataStart, entry.compressedSize);
  if (entry.compressionMethod === 0) {
    if (compressed.byteLength > MAX_UNCOMPRESSED_ENTRY_BYTES) {
      throw new Error('A workbook entry is too large to review safely.');
    }
    if (entry.uncompressedSize > 0 && compressed.byteLength !== entry.uncompressedSize) {
      throw new Error('This XLSX entry does not match its declared size.');
    }
    reserveExpandedBytes(budget, compressed.byteLength);
    return compressed.slice();
  }
  if (entry.compressionMethod === 8) {
    const inflated = await inflateRaw(compressed);
    if (entry.uncompressedSize > 0 && inflated.byteLength !== entry.uncompressedSize) {
      throw new Error('This XLSX worksheet did not decompress to the expected size.');
    }
    reserveExpandedBytes(budget, inflated.byteLength);
    return inflated;
  }
  throw new Error(`Unsupported XLSX compression method: ${entry.compressionMethod}.`);
}

function parseXml(text: string, label: string): Document {
  if (/<!DOCTYPE/i.test(text)) throw new Error(`${label} contains a disallowed document type.`);
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error(`${label} contains invalid XML.`);
  return document;
}

function normalizeZipPath(base: string, target: string): string {
  if (target.startsWith('/')) return target.replace(/^\/+/, '');
  const parts = `${base}/${target}`.split('/');
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') normalized.pop();
    else normalized.push(part);
  }
  return normalized.join('/');
}

function cellColumnIndex(reference: string): number {
  const letters = reference.match(/^[A-Za-z]+/)?.[0] ?? '';
  let value = 0;
  for (const character of letters.toUpperCase()) {
    value = value * 26 + character.charCodeAt(0) - 64;
  }
  return Math.max(0, value - 1);
}

function textContentOf(element: Element | null): string {
  return element?.textContent ?? '';
}

function parseSharedStrings(document: Document | undefined): string[] {
  if (!document) return [];
  return [...document.getElementsByTagName('si')].map((item) =>
    [...item.getElementsByTagName('t')].map((text) => text.textContent ?? '').join(''),
  );
}

function parseWorksheet(document: Document, sharedStrings: readonly string[]): string[][] {
  const rows: string[][] = [];
  for (const rowElement of [...document.getElementsByTagName('row')]) {
    const rowReference = Number(rowElement.getAttribute('r'));
    const rowIndex =
      Number.isInteger(rowReference) && rowReference > 0 ? rowReference - 1 : rows.length;
    if (rowIndex >= MAX_WORKSHEET_ROWS) {
      throw new Error(`This worksheet exceeds ${MAX_WORKSHEET_ROWS.toLocaleString('en-US')} rows.`);
    }
    while (rows.length < rowIndex) rows.push([]);
    const row: string[] = [];
    let fallbackColumn = 0;
    for (const cell of [...rowElement.getElementsByTagName('c')]) {
      const reference = cell.getAttribute('r') ?? '';
      const column = reference ? cellColumnIndex(reference) : fallbackColumn;
      fallbackColumn = column + 1;
      if (column >= MAX_WORKSHEET_COLUMNS) {
        throw new Error(`This worksheet exceeds ${MAX_WORKSHEET_COLUMNS} columns.`);
      }
      const type = cell.getAttribute('t');
      let value = '';
      if (type === 'inlineStr') {
        value = [...cell.getElementsByTagName('t')].map((text) => text.textContent ?? '').join('');
      } else {
        const raw = textContentOf(cell.getElementsByTagName('v')[0] ?? null);
        if (type === 's') value = sharedStrings[Number(raw)] ?? '';
        else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
        else value = raw;
      }
      while (row.length < column) row.push('');
      row[column] = value;
    }
    rows[rowIndex] = row;
  }
  return trimTrailingEmptyRows(rows);
}

async function readXmlEntry(
  buffer: ArrayBuffer,
  entries: Map<string, ZipEntry>,
  path: string,
  budget: ExpansionBudget,
  required = true,
): Promise<Document | undefined> {
  const entry = entries.get(path);
  if (!entry) {
    if (required) throw new Error(`The XLSX file is missing ${path}.`);
    return undefined;
  }
  const bytes = await readZipEntry(buffer, entry, budget);
  return parseXml(new TextDecoder().decode(bytes), path);
}

export async function parseXlsxArrayBuffer(buffer: ArrayBuffer): Promise<ImportWorkbook> {
  const entries = readZipDirectory(buffer);
  const budget: ExpansionBudget = { usedBytes: 0 };
  const workbook = await readXmlEntry(buffer, entries, 'xl/workbook.xml', budget);
  const relationships = await readXmlEntry(buffer, entries, 'xl/_rels/workbook.xml.rels', budget);
  const sharedStringsDocument = await readXmlEntry(
    buffer,
    entries,
    'xl/sharedStrings.xml',
    budget,
    false,
  );
  const sharedStrings = parseSharedStrings(sharedStringsDocument);
  const targets = new Map<string, string>();
  for (const relationship of [...relationships!.getElementsByTagName('Relationship')]) {
    const id = relationship.getAttribute('Id');
    const target = relationship.getAttribute('Target');
    if (id && target) targets.set(id, normalizeZipPath('xl', target));
  }

  const worksheets: ImportWorksheet[] = [];
  for (const sheet of [...workbook!.getElementsByTagName('sheet')]) {
    const name = sheet.getAttribute('name')?.trim() || `Worksheet ${worksheets.length + 1}`;
    const relationshipId =
      sheet.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id',
      ) ?? sheet.getAttribute('r:id');
    const target = relationshipId ? targets.get(relationshipId) : undefined;
    if (!target) throw new Error(`The worksheet “${name}” has no readable relationship target.`);
    const worksheet = await readXmlEntry(buffer, entries, target, budget);
    worksheets.push({
      id: relationshipId ?? target,
      name,
      rows: parseWorksheet(worksheet!, sharedStrings),
    });
  }
  if (worksheets.length === 0) throw new Error('The XLSX file contains no worksheets.');
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
