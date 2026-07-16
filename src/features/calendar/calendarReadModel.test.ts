import { describe, expect, it } from 'vitest';

import type { CalendarEvent, ScheduleBlock } from '@/domain/models/entities';

import {
  buildCalendarMonthReadModel,
  formatCalendarMinute,
  getCalendarMonthRange,
  shiftCalendarMonth,
} from './calendarReadModel';

function scheduleBlock(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    id: 'schedule-block',
    title: 'Schedule block',
    subject: '',
    category: 'Teaching',
    kind: 'teachable',
    weekdays: [1],
    startMinute: 540,
    endMinute: 600,
    planningEnabled: true,
    bumpEnabled: true,
    showInWeek: true,
    sortOrder: 0,
    ...overrides,
  };
}

function calendarEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'calendar-event',
    title: 'Calendar event',
    startDate: '2026-07-15',
    category: 'Calendar',
    ...overrides,
  };
}

describe('calendar month ranges', () => {
  it('builds a Monday-through-Sunday grid around the selected month', () => {
    const range = getCalendarMonthRange('2026-07-15');

    expect(range).toMatchObject({
      label: 'July 2026',
      monthStartDate: '2026-07-01',
      monthEndDate: '2026-07-31',
      gridStartDate: '2026-06-29',
      gridEndDate: '2026-08-02',
    });
    expect(range.dates).toHaveLength(35);
    expect(range.dates[0]).toBe('2026-06-29');
    expect(range.dates.at(-1)).toBe('2026-08-02');
  });

  it('moves between month anchors without using UTC date conversion', () => {
    expect(shiftCalendarMonth('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftCalendarMonth('2026-01-01', -1)).toBe('2025-12-01');
  });
});

describe('calendar read model', () => {
  it('expands recurring blocks by ISO weekday and effective boundaries', () => {
    const blocks = [
      scheduleBlock({ id: 'parent', title: 'Grade 3', kind: 'container' }),
      scheduleBlock({
        id: 'child',
        parentId: 'parent',
        title: 'Chinese',
        startMinute: 550,
        endMinute: 590,
        effectiveFrom: '2026-07-13',
        effectiveTo: '2026-07-20',
      }),
    ];

    const model = buildCalendarMonthReadModel('2026-07-15', blocks, [], '2026-07-15');
    const july6 = model.days.find((day) => day.date === '2026-07-06');
    const july13 = model.days.find((day) => day.date === '2026-07-13');
    const july27 = model.days.find((day) => day.date === '2026-07-27');

    expect(july6?.items.map((item) => item.title)).toEqual(['Grade 3']);
    expect(july13?.items.map((item) => item.title)).toEqual(['Grade 3', 'Chinese']);
    expect(july13?.items[1]?.parentTitle).toBe('Grade 3');
    expect(july27?.items.map((item) => item.title)).toEqual(['Grade 3']);
    expect(model.sourceScheduleBlockCount).toBe(2);
  });

  it('sorts all-day events before timed events and schedule blocks', () => {
    const model = buildCalendarMonthReadModel(
      '2026-07-15',
      [
        scheduleBlock({
          title: 'Morning class',
          weekdays: [3],
          startMinute: 540,
        }),
      ],
      [
        calendarEvent({ id: 'all-day', title: 'No school' }),
        calendarEvent({
          id: 'timed',
          title: 'Assembly',
          startMinute: 540,
          endMinute: 570,
        }),
      ],
      '2026-07-15',
    );

    const selectedDay = model.days.find((day) => day.date === '2026-07-15');
    expect(selectedDay?.items.map((item) => item.title)).toEqual([
      'No school',
      'Assembly',
      'Morning class',
    ]);
    expect(selectedDay?.items.map((item) => item.timeLabel)).toEqual([
      'All day',
      '9:00 AM–9:30 AM',
      '9:00 AM–10:00 AM',
    ]);
    expect(selectedDay?.isToday).toBe(true);
  });

  it('shows every day of a multi-day event, including adjacent-month grid days', () => {
    const model = buildCalendarMonthReadModel(
      '2026-07-15',
      [],
      [
        calendarEvent({
          id: 'conference',
          title: 'Summer institute',
          startDate: '2026-07-31',
          endDate: '2026-08-02',
          startMinute: 780,
          endMinute: 900,
        }),
      ],
      '2026-07-15',
    );

    const july31 = model.days.find((day) => day.date === '2026-07-31');
    const august1 = model.days.find((day) => day.date === '2026-08-01');
    const august2 = model.days.find((day) => day.date === '2026-08-02');

    expect(july31?.items[0]).toMatchObject({
      spanPosition: 'start',
      timeLabel: 'Starts 1:00 PM',
    });
    expect(august1?.items[0]).toMatchObject({
      spanPosition: 'middle',
      timeLabel: 'Continues',
    });
    expect(august2?.items[0]).toMatchObject({
      spanPosition: 'end',
      timeLabel: 'Ends 3:00 PM',
    });
    expect(august1?.inCurrentMonth).toBe(false);
    expect(model.sourceCalendarEventCount).toBe(1);
    expect(model.visibleItemCount).toBe(3);
  });

  it('does not extend an event when an older record has an inverted end date', () => {
    const model = buildCalendarMonthReadModel(
      '2026-07-15',
      [],
      [calendarEvent({ startDate: '2026-07-15', endDate: '2026-07-14' })],
      '2026-07-15',
    );

    expect(model.days.find((day) => day.date === '2026-07-14')?.items).toHaveLength(0);
    expect(model.days.find((day) => day.date === '2026-07-15')?.items).toHaveLength(1);
  });
});

describe('calendar time formatting', () => {
  it('formats midnight, noon, and afternoon minutes', () => {
    expect(formatCalendarMinute(0)).toBe('12:00 AM');
    expect(formatCalendarMinute(720)).toBe('12:00 PM');
    expect(formatCalendarMinute(825)).toBe('1:45 PM');
  });
});
