import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { suggestActivityImportMapping } from './activityImportModel';
import {
  activityImportTemplateHeaders,
  buildActivityImportCsvTemplate,
  buildActivityImportXlsxTemplate,
} from './activityImportTemplate';

describe('activityImportTemplate', () => {
  it('builds a UTF-8 CSV template with only the reviewed Activity headers', () => {
    const csv = buildActivityImportCsvTemplate();
    expect(csv.startsWith('\uFEFF')).toBe(true);

    const workbook = XLSX.read(csv.slice(1), { type: 'string' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    expect(worksheet).toBeDefined();
    const rows = XLSX.utils.sheet_to_json<string[]>(worksheet!, {
      header: 1,
      raw: false,
      blankrows: false,
    });

    expect(rows).toEqual([[...activityImportTemplateHeaders]]);
  });

  it('keeps every formal template header compatible with automatic Activity mapping', () => {
    const mapping = suggestActivityImportMapping([...activityImportTemplateHeaders]);

    expect(mapping).toEqual({
      externalKey: 1,
      title: 2,
      description: 3,
      activityType: 4,
      purpose: 5,
      subject: 6,
      skill: 7,
      gradeLevel: 8,
      languageLevel: 9,
      durationMinutes: 10,
      grouping: 11,
      preparation: 12,
      materials: 13,
      instructions: 14,
      teacherLanguage: 15,
      differentiation: 16,
      variations: 17,
      assessmentOpportunity: 18,
      tags: 19,
      externalSource: 0,
      sourceReference: 20,
      status: 21,
      notes: 22,
    });
  });

  it('builds an XLSX template with import, instruction, and fictional example sheets', () => {
    const workbook = XLSX.read(buildActivityImportXlsxTemplate(), { type: 'array' });
    expect(workbook.SheetNames).toEqual(['Activities Import', 'Instructions', 'Examples']);

    const importRows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['Activities Import']!, {
      header: 1,
      raw: false,
      blankrows: false,
    });
    expect(importRows).toEqual([[...activityImportTemplateHeaders]]);

    const instructionText = XLSX.utils.sheet_to_csv(workbook.Sheets.Instructions!);
    expect(instructionText).toContain(
      'External Source and Activity ID together form the stable update identity',
    );
    expect(instructionText).toContain('Title equality alone never overwrites');
    expect(instructionText).toContain('Pasted table source option');
    expect(instructionText).toContain('fictional examples only');

    const exampleText = XLSX.utils.sheet_to_csv(workbook.Sheets.Examples!);
    expect(exampleText).toContain('DEMO-ACT-001');
    expect(exampleText).toContain('DEMO-ACT-002');
    expect(exampleText).toContain('Fictional template example');
    expect(exampleText).toContain('Replace or delete this fictional example before import');
  });
});
