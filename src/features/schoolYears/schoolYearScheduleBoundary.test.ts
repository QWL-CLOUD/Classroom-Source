import { describe, expect, it } from 'vitest';

import {
  dateAllowsDefaultSchedule,
  scheduleOccurrenceIsVisibleForSchoolYear,
} from './schoolYearScheduleBoundary';

const boundary = {
  startsOn: '2026-08-15',
  endsOn: '2027-06-15',
};

describe('School Year default schedule boundary', () => {
  it('treats the start and end dates as inclusive', () => {
    expect(dateAllowsDefaultSchedule('2026-08-15', boundary)).toBe(true);
    expect(dateAllowsDefaultSchedule('2027-06-15', boundary)).toBe(true);
  });

  it('suppresses recurring schedule before and after the active School Year', () => {
    expect(dateAllowsDefaultSchedule('2026-08-14', boundary)).toBe(false);
    expect(dateAllowsDefaultSchedule('2027-06-16', boundary)).toBe(false);
  });

  it('keeps recurring schedule unbounded when no active School Year exists', () => {
    expect(dateAllowsDefaultSchedule('2026-09-01', null)).toBe(true);
    expect(dateAllowsDefaultSchedule('2026-09-01', undefined)).toBe(true);
  });

  it('keeps explicit dated additions outside the School Year', () => {
    expect(scheduleOccurrenceIsVisibleForSchoolYear('2026-08-14', 'add', boundary)).toBe(true);
    expect(scheduleOccurrenceIsVisibleForSchoolYear('2026-08-14', 'modify', boundary)).toBe(false);
    expect(scheduleOccurrenceIsVisibleForSchoolYear('2026-08-14', undefined, boundary)).toBe(false);
  });
});
