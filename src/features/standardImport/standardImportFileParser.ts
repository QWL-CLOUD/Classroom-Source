import {
  MAX_IMPORT_FILE_BYTES,
  parseDelimitedText,
  parseImportFile,
  parseXlsxArrayBuffer as parseSharedXlsxArrayBuffer,
} from '@/features/importCenter/importSourceAdapters';
import type { ImportWorkbook } from '@/features/importCenter/importTypes';

export type StandardImportFileKind = 'csv' | 'xlsx';
export type StandardImportWorkbook = ImportWorkbook & { kind: StandardImportFileKind };

export { parseDelimitedText };

export async function parseXlsxArrayBuffer(buffer: ArrayBuffer): Promise<StandardImportWorkbook> {
  const workbook = await parseSharedXlsxArrayBuffer(buffer);
  if (workbook.kind !== 'xlsx') throw new Error('The reviewed workbook is not an XLSX source.');
  return { ...workbook, kind: 'xlsx' };
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
  return { ...workbook, kind: workbook.kind };
}
