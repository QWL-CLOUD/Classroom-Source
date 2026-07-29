import { describe, expect, it } from 'vitest';

import {
  buildImportTable,
  createEmptyImportColumnMapping,
  mappedImportValue,
  suggestImportColumnMapping,
} from './importTableModel';

type Field = 'title' | 'description' | 'status';

const fields: readonly Field[] = ['title', 'description', 'status'];
const aliases = {
  title: ['title', 'name'],
  description: ['description', 'details'],
  status: ['status', 'lifecycle'],
} satisfies Record<Field, readonly string[]>;

describe('shared import table model', () => {
  it('finds the first populated header row and keeps stable source row numbers', () => {
    const table = buildImportTable([
      [],
      ['Title', 'Title', 'Status'],
      ['Warm-up', 'Duplicate column value', 'Active'],
      ['', '', ''],
    ]);

    expect(table).toEqual({
      headerRow: 2,
      headers: ['Title', 'Title (2)', 'Status'],
      rows: [
        {
          sourceRow: 3,
          values: ['Warm-up', 'Duplicate column value', 'Active'],
        },
      ],
    });
  });

  it('suggests mappings without writing and normalizes mapped values', () => {
    const table = buildImportTable([
      ['Name', 'Details', 'Lifecycle'],
      ['  Partner talk  ', 'Line one\r\nLine two', ' Active '],
    ]);
    const mapping = suggestImportColumnMapping(table.headers, fields, aliases);

    expect(mapping).toEqual({ title: 0, description: 1, status: 2 });
    expect(mappedImportValue(table.rows[0]!, mapping, 'title')).toBe('Partner talk');
    expect(mappedImportValue(table.rows[0]!, mapping, 'description')).toBe('Line one\nLine two');
    expect(createEmptyImportColumnMapping(fields)).toEqual({
      title: null,
      description: null,
      status: null,
    });
  });
});
