import * as XLSX from 'xlsx';

export type StandardImportTemplateFormat = 'csv' | 'xlsx';

export const standardImportTemplateHeaders = [
  'Issuing Organization',
  'Framework Title',
  'Jurisdiction',
  'Subject',
  'Grade Band or Level',
  'Version',
  'Standard Code',
  'Standard Statement',
  'Parent Code',
  'Status',
  'Sort Order',
  'Source Name',
  'Import Note',
] as const;

const instructionRows: Array<Array<string | number>> = [
  ['Classroom Standards Import Template'],
  [
    'Enter Standards on the Standards Import worksheet. Keep the header row unchanged so Classroom can suggest the column mapping.',
  ],
  [
    'Standard Code and Standard Statement are required. All other columns are optional when the reviewed source attribution is entered in Import Center.',
  ],
  [
    'Row-level source fields override the reviewed source attribution entered in Import Center for that row.',
  ],
  ['Parent Code must refer to another Standard in the same framework or an existing Standard.'],
  ['Status accepts Active or Archived. Leave blank to import as Active.'],
  ['Sort Order accepts a whole number from 0 to 1,000,000.'],
  [
    'The Examples worksheet contains fictional examples only. Do not import it as an official standards source.',
  ],
  ['Delete or replace every fictional example before using it for real instructional data.'],
];

const exampleRows: Array<Array<string | number>> = [
  [...standardImportTemplateHeaders],
  [
    'Example Education Agency',
    'Common Core-style Mathematics Example (Fictional)',
    'Example scope',
    'Mathematics',
    'Grade 3',
    '2026 demo',
    'DEMO.MATH.3.NF',
    'Use equal-parts models to describe fractions in a fictional example framework.',
    '',
    'Active',
    10,
    'Fictional template example',
    'Not an official Common Core standard. Replace or delete before import.',
  ],
  [
    'Example Education Agency',
    'Common Core-style Mathematics Example (Fictional)',
    'Example scope',
    'Mathematics',
    'Grade 3',
    '2026 demo',
    'DEMO.MATH.3.NF.1',
    'Explain a unit fraction using an equal-parts model.',
    'DEMO.MATH.3.NF',
    'Active',
    20,
    'Fictional template example',
    'Not an official Common Core standard. Replace or delete before import.',
  ],
  [
    'Example Language Program',
    'CLA Level Learning-style Example (Fictional)',
    'Example program',
    'Chinese Language Arts',
    'Level 4',
    '2026 demo',
    'DEMO.CLA.L4.IR',
    'Interpret short familiar texts in a fictional language-learning framework.',
    '',
    'Active',
    30,
    'Fictional template example',
    'Not an official CLA Level Learning standard. Replace or delete before import.',
  ],
  [
    'Example Language Program',
    'CLA Level Learning-style Example (Fictional)',
    'Example program',
    'Chinese Language Arts',
    'Level 4',
    '2026 demo',
    'DEMO.CLA.L4.IR.1',
    'Identify the main idea in a short familiar text.',
    'DEMO.CLA.L4.IR',
    'Active',
    40,
    'Fictional template example',
    'Not an official CLA Level Learning standard. Replace or delete before import.',
  ],
];

const templateColumnWidths = [24, 34, 20, 22, 22, 14, 24, 54, 24, 12, 12, 28, 48].map((wch) => ({
  wch,
}));

function createStandardsImportWorksheet() {
  const worksheet = XLSX.utils.aoa_to_sheet([[...standardImportTemplateHeaders]]);
  worksheet['!cols'] = templateColumnWidths;
  worksheet['!autofilter'] = { ref: `A1:M1` };
  return worksheet;
}

function createInstructionsWorksheet() {
  const worksheet = XLSX.utils.aoa_to_sheet(instructionRows);
  worksheet['!cols'] = [{ wch: 112 }];
  return worksheet;
}

function createExamplesWorksheet() {
  const worksheet = XLSX.utils.aoa_to_sheet(exampleRows);
  worksheet['!cols'] = templateColumnWidths;
  worksheet['!autofilter'] = { ref: `A1:M${exampleRows.length}` };
  return worksheet;
}

export function buildStandardImportCsvTemplate(): string {
  const worksheet = createStandardsImportWorksheet();
  return `\uFEFF${XLSX.utils.sheet_to_csv(worksheet)}`;
}

export function buildStandardImportXlsxTemplate(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, createStandardsImportWorksheet(), 'Standards Import');
  XLSX.utils.book_append_sheet(workbook, createInstructionsWorksheet(), 'Instructions');
  XLSX.utils.book_append_sheet(workbook, createExamplesWorksheet(), 'Examples');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadStandardImportTemplate(format: StandardImportTemplateFormat): void {
  if (format === 'csv') {
    downloadBlob(
      new Blob([buildStandardImportCsvTemplate()], { type: 'text/csv;charset=utf-8' }),
      'Classroom-Standards-Import-Template.csv',
    );
    return;
  }

  downloadBlob(
    new Blob([buildStandardImportXlsxTemplate()], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'Classroom-Standards-Import-Template.xlsx',
  );
}
