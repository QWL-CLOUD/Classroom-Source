import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import {
  buildStandardImportCsvTemplate,
  buildStandardImportXlsxTemplate,
  standardImportTemplateHeaders,
} from './standardImportTemplate';

describe('standardImportTemplate', () => {
  it('builds a CSV template with only the reviewed import headers', () => {
    const csv = buildStandardImportCsvTemplate();
    expect(csv.startsWith('\uFEFF')).toBe(true);

    const workbook = XLSX.read(csv.slice(1), { type: 'string' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    expect(worksheet).toBeDefined();
    const rows = XLSX.utils.sheet_to_json<string[]>(worksheet!, {
      header: 1,
      raw: false,
      blankrows: false,
    });

    expect(rows).toEqual([[...standardImportTemplateHeaders]]);
  });

  it('builds an XLSX template with import, instruction, and fictional example sheets', () => {
    const workbook = XLSX.read(buildStandardImportXlsxTemplate(), { type: 'array' });
    expect(workbook.SheetNames).toEqual(['Standards Import', 'Instructions', 'Examples']);

    const importRows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['Standards Import']!, {
      header: 1,
      raw: false,
      blankrows: false,
    });
    expect(importRows).toEqual([[...standardImportTemplateHeaders]]);

    const instructionText = XLSX.utils.sheet_to_csv(workbook.Sheets.Instructions!);
    expect(instructionText).toContain('fictional examples only');
    expect(instructionText).toContain('Do not import it as an official standards source');

    const exampleText = XLSX.utils.sheet_to_csv(workbook.Sheets.Examples!);
    expect(exampleText).toContain('DEMO.MATH.3.NF.1');
    expect(exampleText).toContain('DEMO.CLA.L4.IR.1');
    expect(exampleText).toContain('Not an official Common Core standard');
    expect(exampleText).toContain('Not an official CLA Level Learning standard');
  });
});
