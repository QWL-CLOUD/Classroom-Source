import { describe, expect, it } from 'vitest';
import {
  assertLocalDateRange,
  getMonday,
  getWeekDates,
  localDateRangesOverlap,
  parseLocalDate,
  shiftDays,
} from './localDate';

describe('localDate', () => {
  it('rejects impossible dates', () => {
    expect(parseLocalDate('2026-02-30')).toBeNull();
    expect(parseLocalDate('2026-22-26')).toBeNull();
  });

  it('rejects invalid and reversed date ranges', () => {
    expect(() => assertLocalDateRange('2026-02-30', '2026-03-01')).toThrow(
      'Invalid local start date',
    );
    expect(() => assertLocalDateRange('2026-07-20', '2026-07-13')).toThrow('starts after it ends');
  });

  it('detects inclusive overlap without UTC conversion', () => {
    expect(localDateRangesOverlap('2026-07-10', '2026-07-14', '2026-07-14', '2026-07-20')).toBe(
      true,
    );
    expect(localDateRangesOverlap('2026-07-01', '2026-07-12', '2026-07-13', '2026-07-19')).toBe(
      false,
    );
  });

  it('resolves a Friday to the correct Monday', () => {
    expect(getMonday('2026-07-17')).toBe('2026-07-13');
  });

  it('always generates Monday through Sunday', () => {
    expect(getWeekDates('2026-07-17')).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ]);
  });

  it('shifts dates without using UTC string conversion', () => {
    expect(shiftDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
