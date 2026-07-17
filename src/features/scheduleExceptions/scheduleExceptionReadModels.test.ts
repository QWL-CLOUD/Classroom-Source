import { describe, expect, it } from 'vitest';

import type { ScheduleBlock, ScheduleException } from '@/domain/models/entities';
import { buildCalendarMonthReadModel } from '@/features/calendar/calendarReadModel';
import { buildTodayReadModel } from '@/features/today/todayReadModel';
import { buildWeekReadModel } from '@/features/week/weekReadModel';

function block(): ScheduleBlock {
  return {
    id: 'block',
    title: 'Default class',
    subject: '',
    category: 'Teaching',
    kind: 'teachable',
    weekdays: [5, 6, 7],
    startMinute: 540,
    endMinute: 600,
    planningEnabled: false,
    bumpEnabled: false,
    showInWeek: true,
    sortOrder: 0,
  };
}

const exceptions: ScheduleException[] = [
  {
    id: 'modify',
    date: '2026-07-17',
    scheduleBlockId: 'block',
    action: 'modify',
    replacementTitle: 'Adjusted Friday class',
    replacementStartMinute: 600,
    replacementEndMinute: 660,
  },
  {
    id: 'cancel',
    date: '2026-07-18',
    scheduleBlockId: 'block',
    action: 'cancel',
  },
];

describe('schedule exceptions across workspace read models', () => {
  it('uses the same adjusted and cancelled occurrence in Calendar, Week, and Today', () => {
    const calendar = buildCalendarMonthReadModel(
      '2026-07-17',
      [block()],
      [],
      '2026-07-17',
      exceptions,
    );
    const week = buildWeekReadModel(
      '2026-07-17',
      [block()],
      [],
      'teaching',
      '2026-07-17',
      [],
      [],
      exceptions,
    );
    const friday = buildTodayReadModel('2026-07-17', [block()], [], '2026-07-17', 500, exceptions);
    const saturday = buildTodayReadModel(
      '2026-07-18',
      [block()],
      [],
      '2026-07-18',
      500,
      exceptions,
    );

    expect(calendar.days.find((day) => day.date === '2026-07-17')?.items[0]).toMatchObject({
      title: 'Adjusted Friday class',
      startMinute: 600,
    });
    expect(week.days.find((day) => day.date === '2026-07-17')?.items[0]?.title).toBe(
      'Adjusted Friday class',
    );
    expect(friday.timelineItems[0]?.title).toBe('Adjusted Friday class');
    expect(saturday.timelineItems).toHaveLength(0);
  });
});
