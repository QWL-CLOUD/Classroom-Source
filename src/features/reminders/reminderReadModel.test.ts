import { describe, expect, it } from 'vitest';

import type { Reminder } from '@/domain/models/entities';

import {
  buildReminderListItems,
  selectActiveRemindersForDate,
  shiftReminderSchedule,
} from './reminderReadModel';

function reminder(
  overrides: Partial<Reminder> & Pick<Reminder, 'id' | 'sourceType' | 'sourceId'>,
): Reminder {
  return {
    remindDate: '2026-07-20',
    remindMinute: 540,
    status: 'active',
    createdAt: '2026-07-18T12:00:00.000Z',
    updatedAt: '2026-07-18T12:00:00.000Z',
    ...overrides,
  };
}

describe('reminder read models', () => {
  it('selects only active reminders on the requested date in time order', () => {
    const values = [
      reminder({ id: 'later', sourceType: 'task', sourceId: 'task-1', remindMinute: 600 }),
      reminder({ id: 'dismissed', sourceType: 'task', sourceId: 'task-1', status: 'dismissed' }),
      reminder({
        id: 'other-day',
        sourceType: 'task',
        sourceId: 'task-1',
        remindDate: '2026-07-21',
      }),
      reminder({ id: 'first', sourceType: 'task', sourceId: 'task-1', remindMinute: 480 }),
    ];

    expect(selectActiveRemindersForDate(values, '2026-07-20').map((value) => value.id)).toEqual([
      'first',
      'later',
    ]);
  });

  it('resolves Task, Session, and Calendar Event source titles without copying source records', () => {
    const items = buildReminderListItems(
      [
        reminder({ id: 'task-reminder', sourceType: 'task', sourceId: 'task-1' }),
        reminder({ id: 'session-reminder', sourceType: 'session', sourceId: 'session-1' }),
        reminder({ id: 'event-reminder', sourceType: 'calendar-event', sourceId: 'event-1' }),
      ],
      {
        tasks: [
          {
            id: 'task-1',
            title: 'Prepare materials',
            status: 'active',
            order: 0,
            createdAt: '2026-07-18T12:00:00.000Z',
            updatedAt: '2026-07-18T12:00:00.000Z',
          },
        ],
        sessions: [
          {
            id: 'session-1',
            lessonPlanId: 'plan-1',
            contextId: 'class-1',
            date: '2026-07-20',
            startMinute: 600,
            endMinute: 660,
            deliveryState: 'scheduled',
          },
        ],
        lessonPlans: [
          {
            id: 'plan-1',
            contextId: 'class-1',
            title: 'Chinese lesson',
            subject: 'Chinese',
            workflowState: 'ready',
            createdAt: '2026-07-18T12:00:00.000Z',
            updatedAt: '2026-07-18T12:00:00.000Z',
          },
        ],
        calendarEvents: [
          {
            id: 'event-1',
            title: 'Staff meeting',
            startDate: '2026-07-20',
            category: 'Meeting',
          },
        ],
      },
    );

    expect(items.map((item) => [item.sourceTypeLabel, item.sourceTitle])).toEqual([
      ['Session', 'Chinese lesson'],
      ['Task', 'Prepare materials'],
      ['Calendar event', 'Staff meeting'],
    ]);
  });

  it('snoozes across midnight without changing the source record', () => {
    expect(shiftReminderSchedule('2026-07-20', 1435, 10)).toEqual({
      remindDate: '2026-07-21',
      remindMinute: 5,
    });
  });
});
