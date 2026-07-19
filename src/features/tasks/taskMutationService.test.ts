import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { TaskMutationService } from './taskMutationService';

let databaseSequence = 0;
let database: ClassroomDatabase;

beforeEach(() => {
  databaseSequence += 1;
  database = new ClassroomDatabase(`classroom-v20-task-mutation-${databaseSequence}`);
});

afterEach(async () => {
  const name = database.name;
  database.close();
  await Dexie.delete(name);
});

function serviceWithIds(ids: string[], times: string[] = ['2026-07-18T12:00:00.000Z']) {
  let idIndex = 0;
  let timeIndex = 0;
  return new TaskMutationService(database, {
    createId: () => {
      const value = ids[idIndex];
      idIndex += 1;
      return value ?? `generated-${idIndex}`;
    },
    now: () => {
      const value = times[Math.min(timeIndex, times.length - 1)];
      timeIndex += 1;
      return value ?? '2026-07-18T12:00:00.000Z';
    },
    order: () => 42,
  });
}

describe('TaskMutationService', () => {
  it('creates and edits one shared task with separate Scheduled and Due values', async () => {
    await database.learnerContexts.put({
      id: 'class-3',
      kind: 'class',
      name: 'Grade 3',
      schoolYearId: 'year-1',
      status: 'active',
    });
    const service = serviceWithIds(
      ['task-1', 'create-log', 'update-log'],
      ['2026-07-18T12:00:00.000Z', '2026-07-18T12:00:01.000Z', '2026-07-18T12:05:00.000Z'],
    );
    const history = new EditHistoryService(database, {
      now: () => '2026-07-18T13:00:00.000Z',
    });

    const created = await service.create({
      title: '  Prepare family update  ',
      notes: '  Draft the message.  ',
      scheduledDate: '2026-07-20',
      scheduledMinute: 540,
      dueDate: '2026-07-22',
      dueMinute: 1020,
      contextId: 'class-3',
    });

    expect(created).toMatchObject({
      id: 'task-1',
      title: 'Prepare family update',
      notes: 'Draft the message.',
      status: 'active',
      scheduledDate: '2026-07-20',
      scheduledMinute: 540,
      dueDate: '2026-07-22',
      dueMinute: 1020,
      contextId: 'class-3',
      order: 42,
    });

    const updated = await service.update(created.id, {
      title: 'Send family update',
      notes: '',
      scheduledDate: '2026-07-21',
      scheduledMinute: 600,
      dueDate: '2026-07-23',
      dueMinute: 720,
      contextId: '',
    });

    expect(updated).toMatchObject({
      id: created.id,
      title: 'Send family update',
      scheduledDate: '2026-07-21',
      scheduledMinute: 600,
      dueDate: '2026-07-23',
      dueMinute: 720,
      status: 'active',
    });
    expect(updated.notes).toBeUndefined();
    expect(updated.contextId).toBeUndefined();

    await history.undo();
    expect(await database.tasks.get(created.id)).toMatchObject({
      title: 'Prepare family update',
      contextId: 'class-3',
    });
    await history.redo();
    expect(await database.tasks.get(created.id)).toMatchObject({
      title: 'Send family update',
      scheduledDate: '2026-07-21',
    });
  });

  it('moves a task through Waiting, Completed, Cancelled, and back to Active', async () => {
    const service = serviceWithIds(
      [
        'task-1',
        'create-log',
        'waiting-log',
        'restore-log',
        'completed-log',
        'reopen-log',
        'cancelled-log',
        'restore-2-log',
      ],
      [
        '2026-07-18T12:00:00.000Z',
        '2026-07-18T12:10:00.000Z',
        '2026-07-18T12:20:00.000Z',
        '2026-07-18T12:30:00.000Z',
        '2026-07-18T12:40:00.000Z',
        '2026-07-18T12:50:00.000Z',
        '2026-07-18T13:00:00.000Z',
      ],
    );
    const task = await service.create({ title: 'Lifecycle task' });

    const waiting = await service.wait(task.id);
    expect(waiting).toMatchObject({ status: 'waiting', waitingAt: '2026-07-18T12:10:00.000Z' });
    expect(waiting.completedAt).toBeUndefined();

    const activeFromWaiting = await service.restore(task.id);
    expect(activeFromWaiting.status).toBe('active');
    expect(activeFromWaiting.waitingAt).toBeUndefined();

    const completed = await service.complete(task.id);
    expect(completed).toMatchObject({
      status: 'completed',
      completedAt: '2026-07-18T12:30:00.000Z',
    });

    const reopened = await service.reopen(task.id);
    expect(reopened.status).toBe('active');
    expect(reopened.completedAt).toBeUndefined();

    const cancelled = await service.cancel(task.id);
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelledAt: '2026-07-18T12:50:00.000Z',
    });

    const restored = await service.restore(task.id);
    expect(restored.status).toBe('active');
    expect(restored.cancelledAt).toBeUndefined();
  });

  it('deletes a task and restores the same record through global Undo and Redo', async () => {
    const service = serviceWithIds(['task-1', 'create-log', 'delete-log']);
    const history = new EditHistoryService(database, {
      now: () => '2026-07-18T13:00:00.000Z',
    });
    const task = await service.create({ title: 'Delete safely' });

    await service.delete(task.id);
    expect(await database.tasks.get(task.id)).toBeUndefined();

    await history.undo();
    expect(await database.tasks.get(task.id)).toEqual(task);

    await history.redo();
    expect(await database.tasks.get(task.id)).toBeUndefined();
  });

  it('does not allow a new task to select an archived learner context', async () => {
    await database.learnerContexts.put({
      id: 'archived-context',
      kind: 'group',
      name: 'Archived group',
      schoolYearId: 'year-1',
      status: 'archived',
    });
    const service = serviceWithIds(['task-1', 'create-log']);

    await expect(
      service.create({ title: 'Invalid link', contextId: 'archived-context' }),
    ).rejects.toThrow('Archived learner contexts cannot be selected for a task.');
    expect(await database.tasks.count()).toBe(0);
    expect(await database.changeLog.count()).toBe(0);
  });

  it('preserves an existing archived context link while allowing other fields to be edited', async () => {
    await database.learnerContexts.put({
      id: 'archived-context',
      kind: 'individual',
      name: 'Archived learner',
      schoolYearId: 'year-1',
      status: 'archived',
    });
    await database.tasks.put({
      id: 'historical-task',
      title: 'Historical task',
      status: 'completed',
      contextId: 'archived-context',
      order: 1,
      createdAt: '2026-07-01T12:00:00.000Z',
      updatedAt: '2026-07-02T12:00:00.000Z',
      completedAt: '2026-07-02T12:00:00.000Z',
    });
    const service = serviceWithIds(['update-log'], ['2026-07-18T12:00:00.000Z']);

    const updated = await service.update('historical-task', {
      title: 'Edited historical task',
      contextId: 'archived-context',
    });

    expect(updated).toMatchObject({
      title: 'Edited historical task',
      status: 'completed',
      contextId: 'archived-context',
    });
  });
});
