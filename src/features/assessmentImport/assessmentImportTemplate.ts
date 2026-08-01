import * as XLSX from 'xlsx';

export type AssessmentImportTemplateFormat = 'csv' | 'xlsx';

export const assessmentImportTemplateHeaders = [
  'External Source',
  'Assessment ID',
  'Title',
  'Description',
  'Assessment Kind',
  'Student Prompt',
  'Evidence to Collect',
  'Subject',
  'Grade Level',
  'Language Level',
  'Related Unit',
  'Tags',
  'Source Reference',
  'Status',
  'Notes',
] as const;

const instructions = [
  ['Classroom Assessment Import Template'],
  [
    'Use one row per reusable Assessment definition. Do not place Student names or Student results here.',
  ],
  ['Assessment Kind must be Diagnostic, Formative, Summative, Self-assessment, or Other.'],
  ['External Source + Assessment ID form the only stable automatic update identity.'],
  ['Title equality is only a probable duplicate and never overwrites automatically.'],
  ['Rubric criteria and performance levels are not supported in this phase.'],
  ['Delete the fictional Examples sheet before using the workbook for real data.'],
];

const examples = [
  [...assessmentImportTemplateHeaders],
  [
    'DEMO Curriculum Catalog',
    'DEMO-ASM-001',
    'Fictional picture-sequence retell',
    'A fictional reusable oral-language check.',
    'Formative',
    'Use the fictional pictures to retell the sequence.',
    'Sequence words and complete sentences.',
    'Chinese Language Arts',
    'Grade 3',
    'Intermediate',
    'DEMO Unit 1',
    'oral language; fictional example',
    'DEMO reference only',
    'Active',
    'Replace this fictional row before import.',
  ],
];

function escapeCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildAssessmentImportCsvTemplate(): string {
  return `\uFEFF${assessmentImportTemplateHeaders.map(escapeCsv).join(',')}\r\n`;
}

export function buildAssessmentImportXlsxTemplate(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([[...assessmentImportTemplateHeaders]]),
    'Assessments Import',
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(instructions), 'Instructions');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(examples), 'Examples');
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

export function downloadAssessmentImportTemplate(format: AssessmentImportTemplateFormat): void {
  if (format === 'csv') {
    downloadBlob(
      new Blob([buildAssessmentImportCsvTemplate()], { type: 'text/csv;charset=utf-8' }),
      'Classroom-Assessments-Import-Template.csv',
    );
    return;
  }
  downloadBlob(
    new Blob([buildAssessmentImportXlsxTemplate()], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'Classroom-Assessments-Import-Template.xlsx',
  );
}
