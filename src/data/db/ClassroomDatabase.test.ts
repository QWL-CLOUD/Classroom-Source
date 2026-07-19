import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from './ClassroomDatabase';

const names: string[] = [];

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe('ClassroomDatabase schema upgrades', () => {
  it('upgrades v1 data to schema v2 and adds the Reminder store without losing Tasks', async () => {
    const name = `classroom-v20-upgrade-${crypto.randomUUID()}`;
    names.push(name);
    const legacy = new Dexie(name);
    legacy.version(1).stores({
      tasks: 'id, status, dueDate, contextId, order, updatedAt',
    });
    await legacy.open();
    await legacy.table('tasks').put({
      id: 'legacy-task',
      title: 'Legacy task',
      status: 'active',
      order: 0,
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });
    legacy.close();

    const upgraded = new ClassroomDatabase(name);
    await upgraded.open();

    expect(upgraded.verno).toBe(2);
    expect(await upgraded.tasks.get('legacy-task')).toBeDefined();
    await upgraded.reminders.put({
      id: 'reminder-1',
      sourceType: 'task',
      sourceId: 'legacy-task',
      remindDate: '2026-07-20',
      remindMinute: 540,
      status: 'active',
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });
    expect(await upgraded.reminders.count()).toBe(1);
    upgraded.close();
  });
});
