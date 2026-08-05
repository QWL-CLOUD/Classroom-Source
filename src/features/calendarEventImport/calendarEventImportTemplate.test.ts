import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { suggestCalendarEventImportMapping } from './calendarEventImportModel';
import {
  buildCalendarEventImportCsvTemplate,
  buildCalendarEventImportXlsxTemplate,
  calendarEventImportTemplateHeaders,
} from './calendarEventImportTemplate';

describe('calendarEventImportTemplate', () => {
  it('builds a UTF-8 CSV template with only the reviewed Calendar Event headers', () => {
    const csv = buildCalendarEventImportCsvTemplate();
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const workbook = XLSX.read(csv.slice(1), { type: 'string' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
    const rows = XLSX.utils.sheet_to_json<string[]>(worksheet!, {
      header: 1,
      raw: false,
      blankrows: false,
    });
    expect(rows).toEqual([[...calendarEventImportTemplateHeaders]]);
  });

  it('keeps every formal header compatible with automatic Calendar Event mapping', () => {
    expect(suggestCalendarEventImportMapping([...calendarEventImportTemplateHeaders])).toEqual({
      externalKey: 0,
      title: 1,
      description: 2,
      location: 3,
      startDate: 4,
      endDate: 5,
      startTime: 6,
      endTime: 7,
      timeZone: 8,
      eventType: 9,
      externalSource: 10,
    });
  });

  it('builds Import, Instructions, and fictional Example worksheets', () => {
    const workbook = XLSX.read(buildCalendarEventImportXlsxTemplate(), { type: 'array' });
    expect(workbook.SheetNames).toEqual(['Import', 'Instructions', 'Example']);

    const importRows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Import!, {
      header: 1,
      raw: false,
      blankrows: false,
    });
    expect(importRows).toEqual([[...calendarEventImportTemplateHeaders]]);

    const instructions = XLSX.utils.sheet_to_csv(workbook.Sheets.Instructions!);
    expect(instructions).toContain('one row per non-recurring school-wide Calendar Event');
    expect(instructions).toContain('end_date is inclusive');
    expect(instructions).toContain('Title is never identity');

    const example = XLSX.utils.sheet_to_csv(workbook.Sheets.Example!);
    expect(example).toContain('DEMO-CAL-001');
    expect(example).toContain('Fictional professional learning day');
    expect(example).toContain('DEMO District Calendar');
  });
});
