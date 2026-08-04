import * as XLSX from 'xlsx';

export type ResourceImportTemplateFormat = 'csv' | 'xlsx';

export const resourceImportTemplateHeaders = [
  'External Source',
  'Resource ID',
  'Title',
  'Description',
  'Resource Format',
  'Source or Location',
  'Usage Notes',
  'Subject',
  'Grade Level',
  'Language',
  'Language Level',
  'Purpose',
  'Skill',
  'Version / Year',
  'Owner',
  'Last Checked',
  'Access Notes',
  'Related Unit',
  'Rights / License',
  'Tags',
  'Source Reference',
  'Status',
  'Notes',
] as const;

const instructionRows: string[][] = [
  ['Classroom Resources Import Template'],
  [
    'Enter Resources on the Resources Import worksheet. Keep the header row unchanged so Classroom can suggest every mapping.',
  ],
  ['Title is required. All other columns are optional and remain reviewable before commit.'],
  [
    'External Source and Resource ID together form the stable update identity. Title, URL, or file-name equality alone never overwrites an existing Resource.',
  ],
  [
    'Subject, Grade Level, Language, Language Level, Resource Format, Purpose, and Skill resolve to controlled classifications. Resource Format accepts one value. Unknown, archived, merged, or ambiguous values require an explicit preview decision.',
  ],
  [
    'Source or Location may be an http/https URL, shared-drive label, binder location, book/page reference, or other teacher-readable location.',
  ],
  [
    'Source Reference stores a citation, publisher page, document title, or provenance note. It is not the stable update identity.',
  ],
  [
    'The template stores metadata and references only. Do not paste file contents, binary data, base64, passwords, access tokens, or local computer paths.',
  ],
  ['Status accepts Active or Archived. Leave blank to import as Active.'],
  [
    'You may upload the completed CSV/XLSX file, provide JSON, paste the table, add one URL locally without fetching it, or create metadata-only rows from local files.',
  ],
  [
    'The Examples worksheet contains fictional examples only. Delete or replace every example before using the template for real instructional data.',
  ],
];

const exampleRows: Array<Array<string | number>> = [
  [...resourceImportTemplateHeaders],
  [
    'Example Resource Catalog',
    'DEMO-RES-001',
    'Fictional Weather Picture Deck',
    'A fictional slide deck reference for describing weather.',
    'Slides',
    'Shared Drive / Grade 3 / Fictional Weather Deck.pptx',
    'Use during partner speaking practice.',
    'Chinese Language Arts',
    'Grade 3',
    'Chinese',
    'Intermediate',
    'Oral rehearsal',
    'Speaking',
    '2026 demo',
    'Example curriculum team',
    '2026-07-20',
    'School account required in this fictional example.',
    'Unit 1',
    'Fictional example — replace before import.',
    'Weather, Speaking',
    'Fictional planning guide, p. 4',
    'Active',
    'File contents are not included in this template.',
  ],
  [
    'Example Resource Catalog',
    'DEMO-RES-002',
    'Fictional Museum Map',
    'A fictional public-web reference used only to demonstrate URL metadata.',
    'URL',
    'https://example.invalid/fictional-museum-map',
    'Preview the route before class.',
    'Social Studies',
    'Grade 5',
    'English',
    '',
    'Reference',
    'Map reading',
    '',
    'Example author',
    '2026-07-21',
    'No live service is attached to this reserved example domain.',
    'City Systems',
    'Fictional example — no copyrighted content bundled.',
    'Map, City',
    'Fictional resource list',
    'Active',
    'Replace or delete this fictional example before import.',
  ],
];

const widths = [
  26, 18, 36, 48, 22, 54, 48, 24, 18, 18, 20, 22, 22, 20, 24, 18, 42, 24, 34, 30, 36, 14, 48,
].map((wch) => ({ wch }));

function range(rowCount: number): string {
  return `A1:${XLSX.utils.encode_col(resourceImportTemplateHeaders.length - 1)}${rowCount}`;
}

function importWorksheet() {
  const worksheet = XLSX.utils.aoa_to_sheet([[...resourceImportTemplateHeaders]]);
  worksheet['!cols'] = widths;
  worksheet['!autofilter'] = { ref: range(1) };
  return worksheet;
}

function instructionsWorksheet() {
  const worksheet = XLSX.utils.aoa_to_sheet(instructionRows);
  worksheet['!cols'] = [{ wch: 118 }];
  return worksheet;
}

function examplesWorksheet() {
  const worksheet = XLSX.utils.aoa_to_sheet(exampleRows);
  worksheet['!cols'] = widths;
  worksheet['!autofilter'] = { ref: range(exampleRows.length) };
  return worksheet;
}

export function buildResourceImportCsvTemplate(): string {
  return `\uFEFF${XLSX.utils.sheet_to_csv(importWorksheet())}`;
}

export function buildResourceImportXlsxTemplate(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, importWorksheet(), 'Resources Import');
  XLSX.utils.book_append_sheet(workbook, instructionsWorksheet(), 'Instructions');
  XLSX.utils.book_append_sheet(workbook, examplesWorksheet(), 'Examples');
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

export function downloadResourceImportTemplate(format: ResourceImportTemplateFormat): void {
  if (format === 'csv') {
    downloadBlob(
      new Blob([buildResourceImportCsvTemplate()], { type: 'text/csv;charset=utf-8' }),
      'Classroom-Resources-Import-Template.csv',
    );
    return;
  }
  downloadBlob(
    new Blob([buildResourceImportXlsxTemplate()], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'Classroom-Resources-Import-Template.xlsx',
  );
}
