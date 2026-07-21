import { describe, expect, it } from 'vitest';

import type { CalendarDayItem, CalendarDayReadModel } from './calendarReadModel';
import { buildCalendarWeekPresentation, splitCalendarDayItems } from './calendarPresentation';

function item(
  sourceType: CalendarDayItem['sourceType'],
  id: string,
  overrides: Partial<CalendarDayItem> = {},
): CalendarDayItem {
  return {
    occurrenceId: id,
    sourceRecordId: id,
    sourceType,
    title: id,
    category: 'Test',
    date: '2026-07-20',
    timeLabel: '9:00 AM',
    isAllDay: false,
    spanPosition: 'single',
    sortOrder: 0,
    ...overrides,
  };
}

function day(date: string, items: CalendarDayItem[] = []): CalendarDayReadModel {
  return {
    date,
    label: date,
    weekdayLabel: 'Mon',
    dayNumber: date.slice(-2),
    inCurrentMonth: true,
    isToday: date === '2026-07-20',
    items,
  };
}

describe('calendar presentation', () => {
  it('keeps recurring schedule out of dated highlights', () => {
    const sections = splitCalendarDayItems(
      [
        item('schedule-block', 'schedule-1'),
        item('schedule-block', 'schedule-adjusted', { scheduleExceptionAction: 'modify' }),
        item('calendar-event', 'event-1'),
        item('session-occurrence', 'session-1'),
        item('calendar-event', 'event-2'),
        item('calendar-event', 'event-3'),
      ],
      3,
    );

    expect(sections.highlightedDatedItems.map((value) => value.occurrenceId)).toEqual([
      'schedule-adjusted',
      'event-1',
      'session-1',
    ]);
    expect(sections.hiddenDatedItems.map((value) => value.occurrenceId)).toEqual([
      'event-2',
      'event-3',
    ]);
    expect(sections.scheduleItems.map((value) => value.occurrenceId)).toEqual(['schedule-1']);
    expect(sections.counts).toEqual({ schedule: 2, events: 3, sessions: 1 });
  });

  it('groups month days into weeks and marks the selected week', () => {
    const weeks = buildCalendarWeekPresentation(
      [
        day('2026-07-01'),
        day('2026-07-02'),
        day('2026-07-03'),
        day('2026-07-04'),
        day('2026-07-05'),
        day('2026-07-06'),
        day('2026-07-07'),
        day('2026-07-20', [item('calendar-event', 'event')]),
        day('2026-07-21', [item('schedule-block', 'schedule')]),
      ],
      '2026-07-20',
      '2026-07-20',
    );

    expect(weeks.map((week) => week.id)).toEqual(['2026-06-29', '2026-07-06', '2026-07-20']);
    expect(weeks[0]?.label).toBe('Jul 1–5, 2026');
    expect(weeks[2]).toMatchObject({
      label: 'Jul 20–21, 2026',
      containsSelectedDate: true,
      containsToday: true,
      counts: { schedule: 1, events: 1, sessions: 0 },
    });
  });
});
