import { describe, expect, it } from 'vitest';

import type { CalendarEvent, ScheduleBlock } from '@/domain/models/entities';

import { buildTodayReadModel } from './todayReadModel';

function scheduleBlock(overrides: Partial<ScheduleBlock> = {}): ScheduleBlock {
  return {
    id: 'schedule-block',
    title: 'Schedule block',
    subject: '',
    category: 'Teaching',
    kind: 'teachable',
    weekdays: [3],
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

describe('Today read model', () => {
  it('combines recurring blocks and dated events while preserving parent context', () => {
    const model = buildTodayReadModel(
      '2026-07-15',
      [
        scheduleBlock({
          id: 'parent',
          title: 'Grade 3 day',
          kind: 'container',
          startMinute: 480,
          endMinute: 900,
        }),
        scheduleBlock({
          id: 'child',
          parentId: 'parent',
          title: 'Chinese lesson',
          startMinute: 570,
          endMinute: 660,
        }),
      ],
      [
        calendarEvent({ id: 'holiday', title: 'School holiday' }),
        calendarEvent({
          id: 'meeting',
          title: 'Staff meeting',
          startMinute: 600,
          endMinute: 660,
        }),
      ],
      '2026-07-15',
      500,
    );

    expect(model.timelineItems.map((item) => item.title)).toEqual([
      'School holiday',
      'Grade 3 day',
      'Chinese lesson',
      'Staff meeting',
    ]);
    expect(model.timelineItems.find((item) => item.title === 'Chinese lesson')?.parentTitle).toBe(
      'Grade 3 day',
    );
    expect(model.reminderItems.map((item) => item.title)).toEqual([
      'School holiday',
      'Staff meeting',
    ]);
    expect(model.sourceScheduleBlockCount).toBe(2);
    expect(model.sourceCalendarEventCount).toBe(2);
  });

  it('suppresses only an exact dated duplicate and retains its calendar reminder', () => {
    const model = buildTodayReadModel(
      '2026-07-15',
      [
        scheduleBlock({
          id: 'duplicate-block',
          title: 'Writing workshop',
          category: 'Teaching',
          startMinute: 780,
          endMinute: 840,
        }),
      ],
      [
        calendarEvent({
          id: 'duplicate-event',
          title: 'Writing workshop',
          category: 'Teaching',
          startMinute: 780,
          endMinute: 840,
        }),
      ],
      '2026-07-15',
      600,
    );

    expect(model.timelineItems).toHaveLength(1);
    expect(model.timelineItems[0]?.sourceType).toBe('calendar-event');
    expect(model.reminderItems).toHaveLength(1);
    expect(model.hiddenDuplicateCount).toBe(1);
  });

  it('marks past, current, and upcoming timed items and selects the current item', () => {
    const model = buildTodayReadModel(
      '2026-07-15',
      [
        scheduleBlock({
          id: 'past',
          title: 'Past lesson',
          startMinute: 480,
          endMinute: 540,
        }),
        scheduleBlock({
          id: 'current',
          title: 'Current lesson',
          startMinute: 600,
          endMinute: 660,
          sortOrder: 1,
        }),
        scheduleBlock({
          id: 'next',
          title: 'Next lesson',
          startMinute: 720,
          endMinute: 780,
          sortOrder: 2,
        }),
      ],
      [],
      '2026-07-15',
      630,
    );

    expect(model.timelineItems.map((item) => [item.title, item.temporalStatus])).toEqual([
      ['Past lesson', 'past'],
      ['Current lesson', 'now'],
      ['Next lesson', 'upcoming'],
    ]);
    expect(model.focusItem?.title).toBe('Current lesson');
    expect(model.focusLabel).toBe('Now');
  });

  it('selects the first timed item for a future date and no focus for a past date', () => {
    const blocks = [
      scheduleBlock({
        id: 'future',
        title: 'Future lesson',
        startMinute: 600,
        endMinute: 660,
      }),
    ];

    const future = buildTodayReadModel('2026-07-15', blocks, [], '2026-07-14', 900);
    const past = buildTodayReadModel('2026-07-15', blocks, [], '2026-07-16', 300);

    expect(future.focusItem?.title).toBe('Future lesson');
    expect(future.focusLabel).toBe('First item');
    expect(future.timelineItems[0]?.temporalStatus).toBe('upcoming');
    expect(past.focusItem).toBeNull();
    expect(past.focusLabel).toBeNull();
    expect(past.timelineItems[0]?.temporalStatus).toBe('past');
  });

  it('uses start, continuation, and end labels for a multi-day event', () => {
    const event = calendarEvent({
      id: 'institute',
      title: 'Summer institute',
      startDate: '2026-07-15',
      endDate: '2026-07-17',
      startMinute: 780,
      endMinute: 900,
    });

    const start = buildTodayReadModel('2026-07-15', [], [event], '2026-07-15', 700);
    const middle = buildTodayReadModel('2026-07-16', [], [event], '2026-07-16', 700);
    const end = buildTodayReadModel('2026-07-17', [], [event], '2026-07-17', 700);

    expect(start.timelineItems[0]).toMatchObject({
      timeLabel: 'Starts 1:00 PM',
      temporalStatus: 'upcoming',
    });
    expect(middle.timelineItems[0]).toMatchObject({
      timeLabel: 'Continues',
      temporalStatus: 'now',
    });
    expect(end.timelineItems[0]).toMatchObject({
      timeLabel: 'Ends 3:00 PM',
      temporalStatus: 'now',
    });
  });

  it('honors ISO weekdays and effective boundaries', () => {
    const blocks = [
      scheduleBlock({
        id: 'visible',
        title: 'Visible Wednesday',
        effectiveFrom: '2026-07-15',
        effectiveTo: '2026-07-15',
      }),
      scheduleBlock({
        id: 'expired',
        title: 'Expired Wednesday',
        effectiveTo: '2026-07-14',
      }),
      scheduleBlock({
        id: 'friday',
        title: 'Friday only',
        weekdays: [5],
      }),
    ];

    const model = buildTodayReadModel('2026-07-15', blocks, [], '2026-07-15', 300);

    expect(model.timelineItems.map((item) => item.title)).toEqual(['Visible Wednesday']);
  });

  it('does not extend an older event with an inverted end date', () => {
    const event = calendarEvent({
      startDate: '2026-07-15',
      endDate: '2026-07-14',
    });

    expect(
      buildTodayReadModel('2026-07-14', [], [event], '2026-07-14', 300).timelineItems,
    ).toHaveLength(0);
    expect(
      buildTodayReadModel('2026-07-15', [], [event], '2026-07-15', 300).timelineItems,
    ).toHaveLength(1);
  });
});
