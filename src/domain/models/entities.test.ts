import { describe, expect, it } from 'vitest';
import {
  lessonPlanSchema,
  reminderSchema,
  scheduleBlockSchema,
  sessionOccurrenceSchema,
  taskSchema,
} from './entities';

describe('domain schemas', () => {
  it('accepts a Friday-only schedule block as ordinary recurrence data', () => {
    const block = scheduleBlockSchema.parse({
      id: 'fr-math',
      title: 'Math',
      subject: 'Math',
      kind: 'teachable',
      weekdays: [5],
      startMinute: 530,
      endMinute: 590,
      planningEnabled: true,
      bumpEnabled: true,
      showInWeek: true,
    });
    expect(block.weekdays).toEqual([5]);
  });

  it('rejects sessions whose end is not after the start', () => {
    expect(() =>
      sessionOccurrenceSchema.parse({
        id: 'session-1',
        lessonPlanId: 'lesson-1',
        contextId: 'class-1',
        date: '2026-07-14',
        startMinute: 600,
        endMinute: 590,
        deliveryState: 'scheduled',
      }),
    ).toThrow();
  });
  it('keeps legacy lesson plans compatible without requiring lesson flow', () => {
    const plan = lessonPlanSchema.parse({
      id: 'lesson-1',
      contextId: 'class-1',
      title: 'Legacy lesson',
      subject: '',
      workflowState: 'draft',
      createdAt: '2026-07-17T12:00:00.000Z',
      updatedAt: '2026-07-17T12:00:00.000Z',
    });

    expect(plan.lessonFlow).toBeUndefined();
  });
  it('separates task Scheduled and Due values and supports the full lifecycle', () => {
    const task = taskSchema.parse({
      id: 'task-1',
      title: 'Prepare materials',
      status: 'waiting',
      scheduledDate: '2026-07-20',
      scheduledMinute: 540,
      dueDate: '2026-07-22',
      dueMinute: 1020,
      order: 0,
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
      waitingAt: '2026-07-18T12:00:00.000Z',
    });

    expect(task).toMatchObject({
      status: 'waiting',
      scheduledDate: '2026-07-20',
      dueDate: '2026-07-22',
    });
    expect(() =>
      taskSchema.parse({
        ...task,
        scheduledDate: undefined,
        scheduledMinute: 540,
      }),
    ).toThrow();
  });
  it('models Reminder as a separate source-linked record', () => {
    const reminder = reminderSchema.parse({
      id: 'reminder-1',
      sourceType: 'task',
      sourceId: 'task-1',
      remindDate: '2026-07-20',
      remindMinute: 540,
      status: 'active',
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });

    expect(reminder).toMatchObject({
      sourceType: 'task',
      sourceId: 'task-1',
      status: 'active',
    });
  });
});
