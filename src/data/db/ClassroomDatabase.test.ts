import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from './ClassroomDatabase';

const names: string[] = [];

afterEach(async () => {
  await Promise.all(names.splice(0).map((name) => Dexie.delete(name)));
});

describe('ClassroomDatabase schema upgrades', () => {
  it('upgrades legacy data to schema v5 and adds managed-category stores without losing Tasks', async () => {
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

    expect(upgraded.verno).toBe(5);
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
    await upgraded.learnerNotices.put({
      id: 'notice-1',
      contextId: 'context-1',
      kind: 'ongoing-support',
      title: 'Synthetic support',
      status: 'active',
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });
    expect(await upgraded.learnerNotices.count()).toBe(1);
    await upgraded.categoryValues.put({
      id: 'purpose-reading',
      familyId: 'purpose-tag',
      name: 'Reading',
      normalizedName: 'reading',
      aliases: [],
      normalizedAliases: [],
      sortOrder: 0,
      isDefault: false,
      lifecycleState: 'active',
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
    });
    expect(await upgraded.categoryValues.count()).toBe(1);
    expect(await upgraded.categoryAssignments.count()).toBe(0);

    await upgraded.learnerServiceOccurrences.put({
      id: 'notice-1:2026-07-21',
      learnerNoticeId: 'notice-1',
      date: '2026-07-21',
      status: 'cancelled',
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
      cancelledAt: '2026-07-21T12:00:00.000Z',
    });
    expect(await upgraded.learnerServiceOccurrences.count()).toBe(1);

    upgraded.close();
  });
});
