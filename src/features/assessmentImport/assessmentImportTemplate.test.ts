import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import {
  assessmentImportTemplateHeaders,
  buildAssessmentImportCsvTemplate,
  buildAssessmentImportXlsxTemplate,
} from './assessmentImportTemplate';

describe('assessmentImportTemplate', () => {
  it('builds a UTF-8 BOM header-only CSV', () => {
    const csv = buildAssessmentImportCsvTemplate();
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.trim().split(/\r?\n/)).toHaveLength(1);
    expect(csv).toContain('"Assessment Kind"');
  });

  it('builds import, instruction, and fictional example worksheets', () => {
    const workbook = XLSX.read(buildAssessmentImportXlsxTemplate(), { type: 'array' });
    expect(workbook.SheetNames).toEqual(['Assessments Import', 'Instructions', 'Examples']);
    const importRows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['Assessments Import']!, {
      header: 1,
      raw: false,
    });
    expect(importRows).toEqual([[...assessmentImportTemplateHeaders]]);
    const exampleText = JSON.stringify(
      XLSX.utils.sheet_to_json(workbook.Sheets.Examples!, { header: 1, raw: false }),
    );
    expect(exampleText).toContain('DEMO-ASM-001');
  });
});
