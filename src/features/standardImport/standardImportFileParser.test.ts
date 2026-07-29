import { describe, expect, it } from 'vitest';

import { parseDelimitedText, parseStandardImportFile } from './standardImportFileParser';

describe('Standard import file parsing', () => {
  it('preserves leading row positions and parses quoted multiline CSV values', () => {
    expect(
      parseDelimitedText('\r\nCode,Statement\r\nA.1,"Use ""models"".\nExplain why."\r\n'),
    ).toEqual([[], ['Code', 'Statement'], ['A.1', 'Use "models".\nExplain why.']]);
  });

  it('detects tab-delimited source text and trims only trailing blank rows', () => {
    expect(parseDelimitedText('Code\tStatement\nA.1\tExplain a model.\n\n')).toEqual([
      ['Code', 'Statement'],
      ['A.1', 'Explain a model.'],
    ]);
  });

  it('keeps the Standards adapter restricted to CSV/XLSX while using the shared parser', async () => {
    const workbook = await parseStandardImportFile(
      new File(['Code,Statement\nA.1,Explain a model.'], 'standards.csv'),
    );
    expect(workbook).toEqual({
      kind: 'csv',
      sheets: [
        {
          name: 'CSV data',
          rows: [
            ['Code', 'Statement'],
            ['A.1', 'Explain a model.'],
          ],
        },
      ],
    });
    await expect(parseStandardImportFile(new File(['[]'], 'standards.json'))).rejects.toThrow(
      /\.csv or \.xlsx/,
    );
    await expect(parseStandardImportFile(new File(['x'], 'standards.pdf'))).rejects.toThrow(
      /\.csv or \.xlsx/,
    );
  });
});
