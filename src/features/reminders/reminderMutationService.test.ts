import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { ReminderMutationService } from './reminderMutationService';

let database: ClassroomDatabase;

beforeEach(async () => {
  database = new ClassroomDatabase(`phase-3d-2-reminders-${crypto.randomUUID()}`);
  await database.open();
  await database.tasks.put({
    id: 'task-1',
    title: 'Prepare materials',
    status: 'active',
    order: 0,
    createdAt: '2026-07-18T12:00:00.000Z',
    updatedAt: '2026-07-18T12:00:00.000Z',
  });
  await database.calendarEvents.put({
    id: 'event-1',
    title: 'Staff meeting',
    startDate: '2026-07-20',
    category: 'Meeting',
  });
  await database.sessionOccurrences.put({
    id: 'session-1',
    lessonPlanId: 'plan-1',
    contextId: 'class-1',
    date: '2026-07-20',
    startMinute: 600,
    endMinute: 660,
    deliveryState: 'scheduled',
  });
});

afterEach(async () => {
  await database.delete();
});

function serviceWithIds(ids: string[], times: string[]): ReminderMutationService {
  return new ReminderMutationService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => times.shift() ?? '2026-07-18T12:00:00.000Z',
  });
}

describe('ReminderMutationService', () => {
  it('creates multiple reminders for one Task and keeps Undo/Redo compound and source-safe', async () => {
    const service = serviceWithIds(
      ['reminder-1', 'log-1', 'reminder-2', 'log-2'],
      ['2026-07-18T12:00:00.000Z', '2026-07-18T12:05:00.000Z'],
    );
    const history = new EditHistoryService(database, {
      now: () => '2026-07-18T13:00:00.000Z',
    });

    await service.create({
      sourceType: 'task',
      sourceId: 'task-1',
      remindDate: '2026-07-20',
      remindMinute: 540,
      note: 'First reminder',
    });
    await service.create({
      sourceType: 'task',
      sourceId: 'task-1',
      remindDate: '2026-07-20',
      remindMinute: 600,
      note: 'Second reminder',
    });

    expect(await database.reminders.count()).toBe(2);
    await history.undo();
    expect(await database.reminders.get('reminder-2')).toBeUndefined();
    expect(await database.tasks.get('task-1')).toBeDefined();
    await history.redo();
    expect(await database.reminders.get('reminder-2')).toBeDefined();
  });

  it('edits, dismisses, restores, snoozes, and deletes without completing the source Task', async () => {
    const service = serviceWithIds(
      [
        'reminder-1',
        'create-log',
        'update-log',
        'dismiss-log',
        'restore-log',
        'snooze-log',
        'delete-log',
      ],
      [
        '2026-07-18T12:00:00.000Z',
        '2026-07-18T12:10:00.000Z',
        '2026-07-18T12:20:00.000Z',
        '2026-07-18T12:30:00.000Z',
        '2026-07-18T12:40:00.000Z',
        '2026-07-18T12:50:00.000Z',
      ],
    );

    const created = await service.create({
      sourceType: 'task',
      sourceId: 'task-1',
      remindDate: '2026-07-20',
      remindMinute: 540,
    });
    await service.update(created.id, {
      remindDate: '2026-07-20',
      remindMinute: 555,
      note: 'Updated note',
    });
    await service.dismiss(created.id);
    expect((await database.tasks.get('task-1'))?.status).toBe('active');
    expect((await database.reminders.get(created.id))?.status).toBe('dismissed');

    await service.restore(created.id);
    await service.snooze(created.id, {
      remindDate: '2026-07-21',
      remindMinute: 5,
      note: 'Updated note',
    });
    expect(await database.reminders.get(created.id)).toMatchObject({
      status: 'active',
      remindDate: '2026-07-21',
      remindMinute: 5,
      note: 'Updated note',
    });

    await service.delete(created.id);
    expect(await database.reminders.get(created.id)).toBeUndefined();
    expect((await database.tasks.get('task-1'))?.status).toBe('active');
  });

  it('validates Task, Session, Calendar Event, and Learner Notice sources', async () => {
    const service = serviceWithIds(
      [
        'event-reminder',
        'event-log',
        'session-reminder',
        'session-log',
        'notice-reminder',
        'notice-log',
      ],
      ['2026-07-18T12:00:00.000Z', '2026-07-18T12:05:00.000Z'],
    );

    await service.create({
      sourceType: 'calendar-event',
      sourceId: 'event-1',
      remindDate: '2026-07-20',
      remindMinute: 480,
    });
    await service.create({
      sourceType: 'session',
      sourceId: 'session-1',
      remindDate: '2026-07-20',
      remindMinute: 570,
    });

    await expect(
      service.create({
        sourceType: 'task',
        sourceId: 'missing-task',
        remindDate: '2026-07-20',
        remindMinute: 600,
      }),
    ).rejects.toThrow('Task source not found');
    await expect(
      service.create({
        sourceType: 'learner-notice',
        sourceId: 'notice-1',
        remindDate: '2026-07-20',
        remindMinute: 600,
      }),
    ).rejects.toThrow('Learner notice source not found.');

    await database.learnerNotices.put({
      id: 'notice-1',
      contextId: 'context-1',
      kind: 'ongoing-support',
      title: 'Synthetic support',
      status: 'active',
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });
    await expect(
      service.create({
        sourceType: 'learner-notice',
        sourceId: 'notice-1',
        remindDate: '2026-07-20',
        remindMinute: 600,
      }),
    ).resolves.toMatchObject({ sourceType: 'learner-notice', sourceId: 'notice-1' });
  });
});
