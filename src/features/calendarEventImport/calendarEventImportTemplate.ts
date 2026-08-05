import * as XLSX from 'xlsx';

export type CalendarEventImportTemplateFormat = 'csv' | 'xlsx';

export const calendarEventImportTemplateHeaders = [
  'event_id',
  'title',
  'description',
  'location',
  'start_date',
  'end_date',
  'start_time',
  'end_time',
  'time_zone',
  'event_type',
  'external_source',
] as const;

const instructions = [
  ['Classroom Calendar Events Import Template'],
  ['Use one row per non-recurring school-wide Calendar Event.'],
  ['event_id, title, and start_date are required.'],
  ['external_source is required in the file or as one reviewed workspace default.'],
  ['start_date and end_date use YYYY-MM-DD. end_date is inclusive.'],
  ['start_time and end_time use HH:MM in 24-hour time. Blank times mean all day.'],
  ['event_type accepts one Calendar Event Type and resolves through Categories & Labels.'],
  ['External source + event_id form the stable update identity. Title is never identity.'],
  ['Delete the fictional Example sheet before using the workbook for real data.'],
];

const example = [
  [...calendarEventImportTemplateHeaders],
  [
    'DEMO-CAL-001',
    'Fictional professional learning day',
    'Fictional example for template review.',
    'Demo campus',
    '2026-10-12',
    '2026-10-12',
    '',
    '',
    'America/New_York',
    'Professional Development',
    'DEMO District Calendar',
  ],
];

function escapeCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildCalendarEventImportCsvTemplate(): string {
  return `\uFEFF${calendarEventImportTemplateHeaders.map(escapeCsv).join(',')}\r\n`;
}

export function buildCalendarEventImportXlsxTemplate(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([[...calendarEventImportTemplateHeaders]]),
    'Import',
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(instructions), 'Instructions');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(example), 'Example');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(href);
}

export function downloadCalendarEventImportTemplate(
  format: CalendarEventImportTemplateFormat,
): void {
  if (format === 'csv') {
    downloadBlob(
      new Blob([buildCalendarEventImportCsvTemplate()], { type: 'text/csv;charset=utf-8' }),
      'Classroom-Calendar-Events-Import-Template.csv',
    );
    return;
  }
  downloadBlob(
    new Blob([buildCalendarEventImportXlsxTemplate()], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'Classroom-Calendar-Events-Import-Template.xlsx',
  );
}
