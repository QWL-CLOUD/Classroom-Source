import * as XLSX from 'xlsx';

export type ActivityImportTemplateFormat = 'csv' | 'xlsx';

export const activityImportTemplateHeaders = [
  'External Source',
  'Activity ID',
  'Title',
  'Description',
  'Activity Type',
  'Purpose',
  'Subject',
  'Skill',
  'Grade Level',
  'Language',
  'Language Level',
  'Duration Minutes',
  'Grouping',
  'Preparation',
  'Materials',
  'Steps',
  'Teacher Language',
  'Differentiation',
  'Variations',
  'Assessment Opportunity',
  'Tags',
  'Source Reference',
  'Status',
  'Notes',
] as const;

const instructionRows: Array<Array<string | number>> = [
  ['Classroom Activities Import Template'],
  [
    'Enter Activities on the Activities Import worksheet. Keep the header row unchanged so Classroom can suggest every column mapping.',
  ],
  ['Title is required. All other columns are optional and remain reviewable before commit.'],
  [
    'External Source and Activity ID together form the stable update identity. Title equality alone never overwrites an existing Activity.',
  ],
  [
    'Subject, Grade Level, Language, Language Level, Activity Type, Purpose, and Skill resolve to controlled classifications. Unknown, archived, merged, or ambiguous values require an explicit preview decision.',
  ],
  [
    'Subject, Grade Level, Language, Language Level, Purpose, and Skill may contain multiple values separated by semicolons, vertical bars, or line breaks. Activity Type accepts one value. Tags may contain comma-separated searchable labels.',
  ],
  [
    'Grouping accepts Whole Class, Small Group, Partners, Individual, or Flexible. Duration Minutes accepts a whole number from 1 to 1,440.',
  ],
  ['Status accepts Active or Archived. Leave blank to import as Active.'],
  [
    'Materials, Steps, Teacher Language, Differentiation, Variations, Assessment Opportunity, and Notes are text only. Do not include files, binary data, local paths, or base64 content.',
  ],
  [
    'Source Reference stores a document title, URL, page, or citation. It does not create update identity.',
  ],
  [
    'You may upload the completed CSV or XLSX file, or copy the header and data rows into the Pasted table source option.',
  ],
  [
    'The Examples worksheet contains fictional examples only. Delete or replace every example before using the template for real instructional data.',
  ],
];

const exampleRows: Array<Array<string | number>> = [
  [...activityImportTemplateHeaders],
  [
    'Example Activity Catalog',
    'DEMO-ACT-001',
    'Picture Sequence Retell (Fictional)',
    'Students orally sequence a fictional picture story.',
    'Language practice',
    'Oral rehearsal',
    'Chinese Language Arts',
    'Sequencing',
    'Grade 3',
    'Chinese',
    'Intermediate',
    15,
    'Partners',
    'Print the fictional picture cards.',
    'Fictional picture cards; timer',
    'Partners arrange the cards and retell the sequence.',
    'Use first, next, then, and finally.',
    'Provide sentence frames and allow rehearsal.',
    'Retell from a different character perspective.',
    'Listen for sequence words and complete events.',
    'Speaking, Sequencing',
    'Fictional template example',
    'Active',
    'Replace or delete this fictional example before import.',
  ],
  [
    'Example Activity Catalog',
    'DEMO-ACT-002',
    'Evidence Sort Gallery Walk (Fictional)',
    'Students sort fictional evidence cards and explain their choices.',
    'Collaborative review',
    'Concept review',
    'Interdisciplinary',
    'Evidence selection',
    'Grade 5',
    'English',
    '',
    25,
    'Small Group',
    'Place one fictional card set at each station.',
    'Fictional evidence cards; chart paper',
    'Groups rotate, sort cards, and record one justification at each station.',
    'Ask: What evidence supports your choice?',
    'Reduce the number of cards or provide category labels.',
    'Have students design one additional fictional card.',
    'Collect one written justification from each student.',
    'Collaboration, Evidence',
    'Fictional template example',
    'Active',
    'Not based on a published curriculum. Replace before import.',
  ],
];

const templateColumnWidths = [
  26, 18, 34, 46, 22, 22, 24, 24, 18, 18, 20, 18, 18, 38, 38, 54, 42, 42, 42, 42, 28, 34, 14, 48,
].map((wch) => ({ wch }));

function importSheetRange(rowCount: number): string {
  const finalColumn = XLSX.utils.encode_col(activityImportTemplateHeaders.length - 1);
  return `A1:${finalColumn}${rowCount}`;
}

function createActivitiesImportWorksheet() {
  const worksheet = XLSX.utils.aoa_to_sheet([[...activityImportTemplateHeaders]]);
  worksheet['!cols'] = templateColumnWidths;
  worksheet['!autofilter'] = { ref: importSheetRange(1) };
  return worksheet;
}

function createInstructionsWorksheet() {
  const worksheet = XLSX.utils.aoa_to_sheet(instructionRows);
  worksheet['!cols'] = [{ wch: 118 }];
  return worksheet;
}

function createExamplesWorksheet() {
  const worksheet = XLSX.utils.aoa_to_sheet(exampleRows);
  worksheet['!cols'] = templateColumnWidths;
  worksheet['!autofilter'] = { ref: importSheetRange(exampleRows.length) };
  return worksheet;
}

export function buildActivityImportCsvTemplate(): string {
  return `\uFEFF${XLSX.utils.sheet_to_csv(createActivitiesImportWorksheet())}`;
}

export function buildActivityImportXlsxTemplate(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, createActivitiesImportWorksheet(), 'Activities Import');
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

export function downloadActivityImportTemplate(format: ActivityImportTemplateFormat): void {
  if (format === 'csv') {
    downloadBlob(
      new Blob([buildActivityImportCsvTemplate()], { type: 'text/csv;charset=utf-8' }),
      'Classroom-Activities-Import-Template.csv',
    );
    return;
  }

  downloadBlob(
    new Blob([buildActivityImportXlsxTemplate()], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'Classroom-Activities-Import-Template.xlsx',
  );
}
