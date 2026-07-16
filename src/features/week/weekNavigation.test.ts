import { describe, expect, it } from 'vitest';

import { buildWeekHref, parseWeekViewQuery, toWeekViewQuery } from './weekNavigation';

describe('weekNavigation', () => {
  it('maps public query names to the existing store filters', () => {
    expect(parseWeekViewQuery('schedule')).toBe('teaching');
    expect(parseWeekViewQuery('events')).toBe('calendar');
    expect(parseWeekViewQuery('personal')).toBe('personal');
    expect(parseWeekViewQuery('everything')).toBe('everything');
    expect(parseWeekViewQuery('teaching')).toBe('teaching');
    expect(parseWeekViewQuery('calendar')).toBe('calendar');
    expect(parseWeekViewQuery('unknown')).toBeNull();
  });

  it('creates stable date, view, and focus links', () => {
    expect(toWeekViewQuery('calendar')).toBe('events');
    expect(
      buildWeekHref({
        date: '2026-07-20',
        view: 'everything',
        focus: 'session-occurrence:session-1',
      }),
    ).toBe('#/week?date=2026-07-20&view=everything&focus=session-occurrence%3Asession-1');
  });

  it('rejects invalid local dates', () => {
    expect(() => buildWeekHref({ date: '2026-02-30', view: 'schedule' })).toThrow(
      'Invalid Week date',
    );
  });
});
