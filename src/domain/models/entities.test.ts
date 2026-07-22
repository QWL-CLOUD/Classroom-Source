import { describe, expect, it } from 'vitest';
import {
  categoryValueSchema,
  learnerNoticeSchema,
  lessonPlanSchema,
  reminderSchema,
  scheduleBlockSchema,
  schoolYearSchema,
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

  it('requires a date for date-specific learner notices while keeping support records open-ended', () => {
    const support = learnerNoticeSchema.parse({
      id: 'notice-support',
      contextId: 'context-1',
      kind: 'ongoing-support',
      title: 'Reading support',
      status: 'active',
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });
    expect(support.noticeDate).toBeUndefined();
    expect(() =>
      learnerNoticeSchema.parse({
        ...support,
        id: 'notice-date',
        kind: 'date-specific-notice',
      }),
    ).toThrow('requires a date');
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
  it('requires category lifecycle metadata to remain internally consistent', () => {
    const active = categoryValueSchema.parse({
      id: 'purpose-reading',
      familyId: 'purpose-tag',
      name: 'Reading',
      normalizedName: 'reading',
      aliases: ['Literacy'],
      normalizedAliases: ['literacy'],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
    });
    expect(active.familyId).toBe('purpose-tag');
    expect(() =>
      categoryValueSchema.parse({
        ...active,
        lifecycleState: 'merged',
        mergedIntoId: undefined,
        mergedAt: undefined,
      }),
    ).toThrow('requires its replacement');
  });

  it('keeps existing school years compatible while preventing archived active records', () => {
    expect(
      schoolYearSchema.parse({
        id: 'school-year-existing',
        label: '2026–2027',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        active: true,
      }),
    ).toMatchObject({ active: true });

    expect(() =>
      schoolYearSchema.parse({
        id: 'school-year-invalid',
        label: 'Archived active year',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        active: true,
        lifecycleState: 'archived',
      }),
    ).toThrow('archived school year');
  });
});
