import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { suggestResourceImportMapping } from './resourceImportModel';
import {
  buildResourceImportCsvTemplate,
  buildResourceImportXlsxTemplate,
  resourceImportTemplateHeaders,
} from './resourceImportTemplate';

describe('resourceImportTemplate', () => {
  it('builds a UTF-8 CSV template with only reviewed Resource headers', () => {
    const csv = buildResourceImportCsvTemplate();
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const workbook = XLSX.read(csv.slice(1), { type: 'string' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    const rows = XLSX.utils.sheet_to_json<string[]>(worksheet!, {
      header: 1,
      raw: false,
      blankrows: false,
    });
    expect(rows).toEqual([[...resourceImportTemplateHeaders]]);
  });

  it('maps all formal Resource headers to the reviewed model fields', () => {
    expect(suggestResourceImportMapping([...resourceImportTemplateHeaders])).toEqual({
      externalKey: 1,
      title: 2,
      description: 3,
      resourceFormat: 4,
      sourceLocation: 5,
      usageNotes: 6,
      subject: 7,
      gradeLevel: 8,
      language: 9,
      languageLevel: 10,
      purpose: 11,
      skill: 12,
      versionYear: 13,
      owner: 14,
      lastChecked: 15,
      accessNotes: 16,
      relatedUnit: 17,
      rightsLicense: 18,
      tags: 19,
      externalSource: 0,
      sourceReference: 20,
      status: 21,
      notes: 22,
    });
  });

  it('builds import, instruction, and fictional example worksheets', () => {
    const workbook = XLSX.read(buildResourceImportXlsxTemplate(), { type: 'array' });
    expect(workbook.SheetNames).toEqual(['Resources Import', 'Instructions', 'Examples']);
    expect(XLSX.utils.sheet_to_csv(workbook.Sheets.Instructions!)).toContain(
      'metadata and references only',
    );
    const examples = XLSX.utils.sheet_to_csv(workbook.Sheets.Examples!);
    expect(examples).toContain('DEMO-RES-001');
    expect(examples).toContain('example.invalid');
    expect(examples).toContain('Replace or delete this fictional example before import');
    expect(examples).not.toContain('drive.google.com');
  });
});
