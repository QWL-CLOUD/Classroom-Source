import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import { suggestAssessmentImportMapping } from './assessmentImportModel';
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

  it('maps every formal classification header to the Assessment model', () => {
    expect(suggestAssessmentImportMapping([...assessmentImportTemplateHeaders])).toEqual({
      externalKey: 1,
      title: 2,
      description: 3,
      assessmentKind: 4,
      studentPrompt: 5,
      evidenceToCollect: 6,
      subject: 7,
      gradeLevel: 8,
      language: 9,
      languageLevel: 10,
      purpose: 11,
      skill: 12,
      relatedUnit: 13,
      tags: 14,
      externalSource: 0,
      sourceReference: 15,
      status: 16,
      notes: 17,
    });
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
