import { describe, expect, it } from 'vitest';

import {
  createScheduleBlockEditorValues,
  parseScheduleBlockEditorValues,
  scheduleBlockEditorValuesSchema,
  toScheduleBlockEditorValues,
} from './scheduleBlockEditorModel';

describe('scheduleBlockEditorModel', () => {
  it('normalizes weekdays and converts times to minutes', () => {
    const fields = parseScheduleBlockEditorValues({
      ...createScheduleBlockEditorValues(),
      title: ' Dismissal ',
      weekdays: [4, 1, 4, 2, 3],
      startTime: '15:05',
      endTime: '15:25',
      effectiveFrom: '2026-08-12',
      effectiveTo: '2027-06-17',
    });

    expect(fields).toMatchObject({
      title: 'Dismissal',
      weekdays: [1, 2, 3, 4],
      startMinute: 905,
      endMinute: 925,
      effectiveFrom: '2026-08-12',
      effectiveTo: '2027-06-17',
    });
  });

  it('rejects blank titles, missing weekdays, reversed time, and reversed dates', () => {
    const result = scheduleBlockEditorValuesSchema.safeParse({
      ...createScheduleBlockEditorValues(),
      title: ' ',
      weekdays: [],
      startTime: '10:00',
      endTime: '09:00',
      effectiveFrom: '2026-09-01',
      effectiveTo: '2026-08-31',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => String(issue.path[0]))).toEqual(
      expect.arrayContaining(['title', 'weekdays', 'endTime', 'effectiveTo']),
    );
  });

  it('round-trips a schedule block without deferred editor fields', () => {
    const values = toScheduleBlockEditorValues({
      id: 'block-1',
      title: 'Weekend enrichment',
      subject: 'Chinese',
      category: 'Teaching',
      kind: 'teachable',
      weekdays: [6, 7],
      startMinute: 600,
      endMinute: 660,
      planningEnabled: true,
      bumpEnabled: true,
      showInWeek: false,
      sortOrder: 3,
    });

    expect(values).toEqual({
      title: 'Weekend enrichment',
      category: 'Teaching',
      kind: 'teachable',
      weekdays: [6, 7],
      startTime: '10:00',
      endTime: '11:00',
      effectiveFrom: '',
      effectiveTo: '',
      showInWeek: false,
      parentId: '',
    });
  });
});
