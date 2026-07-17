import { describe, expect, it } from 'vitest';

import { parseScheduleExceptionEditorValues } from './scheduleExceptionEditorModel';

describe('schedule exception editor validation', () => {
  it('parses a valid controlled edit', () => {
    expect(
      parseScheduleExceptionEditorValues({
        title: 'Adjusted class',
        startTime: '10:15',
        endTime: '11:00',
        reason: 'Assembly',
        scope: 'occurrence',
      }),
    ).toEqual({
      title: 'Adjusted class',
      startMinute: 615,
      endMinute: 660,
      reason: 'Assembly',
      scope: 'occurrence',
    });
  });

  it('rejects blank titles and reversed times', () => {
    expect(() =>
      parseScheduleExceptionEditorValues({
        title: ' ',
        startTime: '11:00',
        endTime: '10:00',
        reason: '',
        scope: 'future',
      }),
    ).toThrow();
  });
});
