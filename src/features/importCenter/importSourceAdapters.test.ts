import { describe, expect, it } from 'vitest';

import {
  parseDelimitedText,
  parseImportFile,
  parseJsonImportText,
  parsePastedImportTable,
} from './importSourceAdapters';

describe('shared import source adapters', () => {
  it('parses quoted CSV while preserving leading source rows', () => {
    expect(
      parseDelimitedText('\r\nTitle,Description\r\nActivity 1,"Line one\nLine two"\r\n'),
    ).toEqual([[], ['Title', 'Description'], ['Activity 1', 'Line one\nLine two']]);
  });

  it('normalizes JSON object arrays into a stable worksheet', () => {
    const workbook = parseJsonImportText(
      JSON.stringify([
        { title: 'Activity 1', duration: 20 },
        { title: 'Activity 2', grouping: 'partners' },
      ]),
    );

    expect(workbook.kind).toBe('json');
    expect(workbook.worksheets[0]).toMatchObject({
      id: 'json-data',
      name: 'JSON data',
      rows: [
        ['title', 'duration', 'grouping'],
        ['Activity 1', '20', ''],
        ['Activity 2', '', 'partners'],
      ],
    });
  });

  it('accepts explicit JSON worksheets and paste-table input', () => {
    const workbook = parseJsonImportText(
      JSON.stringify({
        sheets: [
          { id: 'activities', name: 'Activities', rows: [['Title'], ['Warm-up']] },
          { name: 'Resources', rows: [{ title: 'Map', url: 'https://example.test/map' }] },
        ],
      }),
    );
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Activities', 'Resources']);
    expect(workbook.worksheets[1]?.rows).toEqual([
      ['title', 'url'],
      ['Map', 'https://example.test/map'],
    ]);

    expect(parsePastedImportTable('Title\tStatus\nWarm-up\tActive').worksheets[0]?.rows).toEqual([
      ['Title', 'Status'],
      ['Warm-up', 'Active'],
    ]);
  });

  it('reads supported files and rejects unsupported files before persistence', async () => {
    const workbook = await parseImportFile(
      new File([JSON.stringify([{ title: 'Exit ticket' }])], 'assessments.json'),
    );
    expect(workbook).toMatchObject({ kind: 'json', sourceLabel: 'assessments.json' });

    await expect(parseImportFile(new File(['x'], 'catalog.pdf'))).rejects.toThrow(
      /\.csv, \.xlsx, or \.json/,
    );
  });
});
