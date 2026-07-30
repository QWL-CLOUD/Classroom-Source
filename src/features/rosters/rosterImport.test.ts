import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import type { StudentRecord } from '@/domain/models/entities';

import {
  buildRosterImportPreview,
  parseRosterImportFile,
  parseRosterImportWorksheet,
  toRosterImportItems,
} from './rosterImport';

const student = (
  id: string,
  name: string,
  status: StudentRecord['status'] = 'active',
): StudentRecord => ({
  id,
  name,
  status,
  createdAt: '2026-07-27T12:00:00.000Z',
  updatedAt: '2026-07-27T12:00:00.000Z',
  ...(status === 'archived' ? { archivedAt: '2026-07-27T12:00:00.000Z' } : {}),
});

describe('roster import parsing and preview', () => {
  it('parses CSV aliases and classifies existing, new, archived, and duplicate rows', async () => {
    const file = new File(
      [
        'Student Name,Preferred Name,Role,Student Notes\n',
        'Amy Chen,Amy,Student,Existing\n',
        'Elena Park,Ellie,Student,New\n',
        'Dana Old,,Student,Archived\n',
        'Elena Park,Ellie,Student,Duplicate\n',
      ],
      'roster.csv',
      { type: 'text/csv' },
    );

    const workbook = await parseRosterImportFile(file);
    const rows = parseRosterImportWorksheet(workbook.worksheets[0]?.rows ?? []);
    const preview = buildRosterImportPreview(
      rows,
      [student('amy', 'Amy Chen'), student('dana', 'Dana Old', 'archived')],
      new Set(),
    );

    expect(preview.map((row) => row.status)).toEqual([
      'existing',
      'new',
      'archived',
      'duplicate-file',
    ]);
    expect(toRosterImportItems(preview)).toEqual([
      {
        kind: 'existing',
        studentId: 'amy',
        role: 'Student',
      },
      {
        kind: 'new',
        student: {
          name: 'Elena Park',
          preferredName: 'Ellie',
          notes: 'New',
        },
        role: 'Student',
      },
    ]);
  });

  it('preserves XLSX worksheet selection before building roster rows', async () => {
    const first = XLSX.utils.aoa_to_sheet([
      ['Name', 'Preferred Name', 'Role', 'Notes'],
      ['First Student', 'First', 'Student', 'First sheet'],
    ]);
    const second = XLSX.utils.aoa_to_sheet([
      ['Name', 'Preferred Name', 'Role', 'Notes'],
      ['Second Student', 'Second', 'Student', 'Selected sheet'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, first, 'First Roster');
    XLSX.utils.book_append_sheet(workbook, second, 'Second Roster');
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const file = new File([data], 'roster.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const parsed = await parseRosterImportFile(file);
    expect(parsed.worksheets.map((sheet) => sheet.name)).toEqual(['First Roster', 'Second Roster']);
    expect(parseRosterImportWorksheet(parsed.worksheets[1]?.rows ?? [])).toEqual([
      {
        sourceRow: 2,
        name: 'Second Student',
        preferredName: 'Second',
        role: 'Student',
        notes: 'Selected sheet',
      },
    ]);
  });

  it('rejects a selected worksheet without a Name column', async () => {
    expect(() =>
      parseRosterImportWorksheet([
        ['Nickname', 'Role'],
        ['Amy', 'Student'],
      ]),
    ).toThrow(/Name column/);
    await expect(parseRosterImportFile(new File(['[]'], 'roster.json'))).rejects.toThrow(
      /\.csv or \.xlsx/,
    );
  });
});
