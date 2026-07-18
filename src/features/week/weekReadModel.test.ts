import { describe, expect, it } from 'vitest';

import type {
  CalendarEvent,
  LessonPlan,
  ScheduleBlock,
  SessionOccurrence,
} from '@/domain/models/entities';

import { buildWeekReadModel, getWeekRange, shiftWeek, type WeekViewFilter } from './weekReadModel';

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

function build(
  scheduleBlocks: readonly ScheduleBlock[],
  calendarEvents: readonly CalendarEvent[],
  viewFilter: WeekViewFilter = 'everything',
) {
  return buildWeekReadModel('2026-07-15', scheduleBlocks, calendarEvents, viewFilter, '2026-07-15');
}

describe('week ranges', () => {
  it('resolves a Monday-through-Sunday range from any selected day', () => {
    expect(getWeekRange('2026-07-15')).toMatchObject({
      mondayDate: '2026-07-13',
      sundayDate: '2026-07-19',
      label: 'Jul 13 – Jul 19',
      ariaLabel: 'Week of July 13, 2026',
    });
    expect(getWeekRange('2026-07-15').dates).toHaveLength(7);
  });

  it('moves between week anchors without UTC conversion', () => {
    expect(shiftWeek('2026-07-15', 1)).toBe('2026-07-20');
    expect(shiftWeek('2026-01-01', -1)).toBe('2025-12-22');
  });
});

describe('week read model', () => {
  it('renders Friday blocks and respects show-in-week and effective boundaries', () => {
    const model = build(
      [
        scheduleBlock({ id: 'friday', title: 'Friday lesson', weekdays: [5] }),
        scheduleBlock({ id: 'hidden', title: 'Hidden Friday', weekdays: [5], showInWeek: false }),
        scheduleBlock({
          id: 'future',
          title: 'Future Friday',
          weekdays: [5],
          effectiveFrom: '2026-07-24',
        }),
      ],
      [],
    );

    const friday = model.days.find((day) => day.date === '2026-07-17');
    expect(friday?.items.map((item) => item.title)).toEqual(['Friday lesson']);
  });

  it('preserves parent and child schedule blocks in the same day', () => {
    const model = build(
      [
        scheduleBlock({ id: 'parent', title: 'Grade 3 day', kind: 'container', startMinute: 480 }),
        scheduleBlock({ id: 'child', parentId: 'parent', title: 'Chinese lesson', sortOrder: 1 }),
      ],
      [],
    );

    const wednesday = model.days.find((day) => day.date === '2026-07-15');
    expect(wednesday?.items.map((item) => item.title)).toEqual(['Grade 3 day', 'Chinese lesson']);
    expect(wednesday?.items[1]?.parentTitle).toBe('Grade 3 day');
  });

  it('prefers an exact dated event over a matching recurring block only when both are visible', () => {
    const block = scheduleBlock({
      id: 'duplicate-block',
      title: 'Exact lesson',
      startMinute: 780,
      endMinute: 840,
    });
    const event = calendarEvent({
      id: 'duplicate-event',
      title: 'Exact lesson',
      category: 'Teaching',
      startMinute: 780,
      endMinute: 840,
    });

    const everything = build([block], [event], 'everything');
    const teaching = build([block], [event], 'teaching');
    const everythingDay = everything.days.find((day) => day.date === '2026-07-15');
    const teachingDay = teaching.days.find((day) => day.date === '2026-07-15');

    expect(everythingDay?.items).toHaveLength(1);
    expect(everythingDay?.items[0]?.sourceType).toBe('calendar-event');
    expect(everything.hiddenDuplicateCount).toBe(1);
    expect(teachingDay?.items).toHaveLength(1);
    expect(teachingDay?.items[0]?.sourceType).toBe('schedule-block');
    expect(teaching.hiddenDuplicateCount).toBe(0);
  });

  it('attaches a scheduled Session to its Schedule occurrence instead of rendering a second item', () => {
    const plan: LessonPlan = {
      id: 'attached-plan',
      contextId: 'context',
      title: 'Attached lesson',
      subject: 'Language',
      workflowState: 'ready',
      preferredScheduleBlockId: 'schedule-block',
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-01T12:00:00.000Z',
    };
    const session: SessionOccurrence = {
      id: 'attached-session',
      lessonPlanId: plan.id,
      contextId: 'context',
      scheduleBlockId: 'schedule-block',
      date: '2026-07-15',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'scheduled',
    };

    const model = buildWeekReadModel(
      '2026-07-15',
      [scheduleBlock()],
      [],
      'everything',
      '2026-07-15',
      [plan],
      [session],
    );
    const selectedDay = model.days.find((day) => day.date === '2026-07-15');

    expect(selectedDay?.items).toHaveLength(1);
    expect(selectedDay?.items[0]).toMatchObject({
      sourceType: 'schedule-block',
      planningEnabled: true,
      attachedSessions: [
        {
          sessionId: 'attached-session',
          lessonPlanId: 'attached-plan',
          title: 'Attached lesson',
          contextId: 'context',
          deliveryState: 'scheduled',
        },
      ],
    });
    expect(model.sourceSessionOccurrenceCount).toBe(1);
  });

  it('separates calendar and personal agenda filters', () => {
    const events = [
      calendarEvent({ id: 'school', title: 'School holiday', category: 'School calendar' }),
      calendarEvent({ id: 'personal', title: 'Personal appointment', category: 'Personal' }),
    ];

    const calendar = build([], events, 'calendar');
    const personal = build([], events, 'personal');
    const selectedCalendarDay = calendar.days.find((day) => day.date === '2026-07-15');
    const selectedPersonalDay = personal.days.find((day) => day.date === '2026-07-15');

    expect(selectedCalendarDay?.items.map((item) => item.title)).toEqual(['School holiday']);
    expect(selectedPersonalDay?.items.map((item) => item.title)).toEqual(['Personal appointment']);
  });

  it('shows start, continuation, and end labels for multi-day events', () => {
    const model = build(
      [],
      [
        calendarEvent({
          id: 'institute',
          title: 'Summer institute',
          startDate: '2026-07-17',
          endDate: '2026-07-19',
          startMinute: 780,
          endMinute: 900,
        }),
      ],
    );

    expect(model.days.find((day) => day.date === '2026-07-17')?.items[0]?.timeLabel).toBe(
      'Starts 1:00 PM',
    );
    expect(model.days.find((day) => day.date === '2026-07-18')?.items[0]?.timeLabel).toBe(
      'Continues',
    );
    expect(model.days.find((day) => day.date === '2026-07-19')?.items[0]?.timeLabel).toBe(
      'Ends 3:00 PM',
    );
  });

  it('sorts all-day events before timed events and schedule blocks', () => {
    const model = build(
      [scheduleBlock({ title: 'Morning class', startMinute: 600, endMinute: 660 })],
      [
        calendarEvent({ id: 'all-day', title: 'No school' }),
        calendarEvent({
          id: 'timed',
          title: 'Staff meeting',
          startMinute: 570,
          endMinute: 600,
        }),
      ],
    );

    const selectedDay = model.days.find((day) => day.date === '2026-07-15');
    expect(selectedDay?.items.map((item) => item.title)).toEqual([
      'No school',
      'Staff meeting',
      'Morning class',
    ]);
    expect(selectedDay?.isToday).toBe(true);
  });
});
