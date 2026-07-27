import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import type { StudentRecord } from '@/domain/models/entities';

import {
  buildRosterImportPreview,
  parseRosterImportFile,
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

    const rows = await parseRosterImportFile(file);
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

  it('parses the first worksheet of an XLSX roster file', async () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Name', 'Preferred Name', 'Role', 'Notes'],
      ['XLSX Student', 'Excel', 'Student', 'Imported from workbook'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Roster Import');
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const file = new File([data], 'roster.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await expect(parseRosterImportFile(file)).resolves.toEqual([
      {
        sourceRow: 2,
        name: 'XLSX Student',
        preferredName: 'Excel',
        role: 'Student',
        notes: 'Imported from workbook',
      },
    ]);
  });

  it('rejects a file without a Name column', async () => {
    const file = new File(['Nickname,Role\nAmy,Student\n'], 'bad.csv', {
      type: 'text/csv',
    });
    await expect(parseRosterImportFile(file)).rejects.toThrow(/Name column/);
  });
});
