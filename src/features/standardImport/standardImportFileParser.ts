import {
  MAX_IMPORT_FILE_BYTES,
  parseDelimitedText,
  parseImportFile,
  parseXlsxArrayBuffer as parseSharedXlsxArrayBuffer,
} from '@/features/importCenter/importSourceAdapters';

export type StandardImportFileKind = 'csv' | 'xlsx';

export interface StandardImportSheet {
  name: string;
  rows: string[][];
}

export interface StandardImportWorkbook {
  kind: StandardImportFileKind;
  sheets: StandardImportSheet[];
}

export { parseDelimitedText };

function toStandardWorkbook(
  workbook: Awaited<ReturnType<typeof parseSharedXlsxArrayBuffer>>,
): StandardImportWorkbook {
  if (workbook.kind !== 'xlsx') throw new Error('The reviewed workbook is not an XLSX source.');
  return {
    kind: 'xlsx',
    sheets: workbook.worksheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows })),
  };
}

export async function parseXlsxArrayBuffer(buffer: ArrayBuffer): Promise<StandardImportWorkbook> {
  return toStandardWorkbook(await parseSharedXlsxArrayBuffer(buffer));
}

export async function parseStandardImportFile(file: File): Promise<StandardImportWorkbook> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('Choose a CSV or XLSX file no larger than 20 MB.');
  }
  const extension = file.name.split('.').at(-1)?.toLocaleLowerCase('en');
  if (extension !== 'csv' && extension !== 'xlsx') {
    throw new Error('Choose a .csv or .xlsx file.');
  }
  const workbook = await parseImportFile(file);
  if (workbook.kind !== 'csv' && workbook.kind !== 'xlsx') {
    throw new Error('Choose a .csv or .xlsx file.');
  }
  return {
    kind: workbook.kind,
    sheets: workbook.worksheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows })),
  };
}
