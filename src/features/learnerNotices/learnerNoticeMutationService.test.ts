import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import type { LearnerContext } from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { LearnerNoticeMutationService } from './learnerNoticeMutationService';

let database: ClassroomDatabase;

const activeContext: LearnerContext = {
  id: 'context-active',
  kind: 'individual',
  name: 'Synthetic learner',
  schoolYearId: 'school-year-current',
  status: 'active',
};

const archivedContext: LearnerContext = {
  ...activeContext,
  id: 'context-archived',
  name: 'Archived learner',
  status: 'archived',
};

beforeEach(async () => {
  database = new ClassroomDatabase(`learner-notice-${crypto.randomUUID()}`);
  await database.open();
  await database.learnerContexts.bulkPut([activeContext, archivedContext]);
});

afterEach(async () => {
  await database.delete();
});

function createService(ids: string[]): LearnerNoticeMutationService {
  return new LearnerNoticeMutationService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => '2026-07-18T20:00:00.000Z',
    order: () => 7,
  });
}

describe('LearnerNoticeMutationService', () => {
  it('creates one shared notice with an explicitly requested follow-up Task and undoes both atomically', async () => {
    const service = createService(['notice-1', 'task-1', 'log-1']);
    const history = new EditHistoryService(database, {
      now: () => '2026-07-18T21:00:00.000Z',
    });

    const result = await service.create({
      contextId: activeContext.id,
      kind: 'date-specific-notice',
      title: 'Bring reading folder',
      details: 'Check the folder at arrival.',
      noticeDate: '2026-07-20',
      createFollowUpTask: true,
      followUpScheduledDate: '2026-07-20',
    });

    expect(result.notice).toMatchObject({
      id: 'notice-1',
      contextId: activeContext.id,
      kind: 'date-specific-notice',
      status: 'active',
      noticeDate: '2026-07-20',
    });
    expect(result.followUpTask).toMatchObject({
      id: 'task-1',
      title: 'Follow up: Bring reading folder',
      contextId: activeContext.id,
      linkedEntityType: 'learner-notice',
      linkedEntityId: 'notice-1',
      scheduledDate: '2026-07-20',
    });

    await history.undo();
    expect(await database.learnerNotices.count()).toBe(0);
    expect(await database.tasks.count()).toBe(0);

    await history.redo();
    expect(await database.learnerNotices.get('notice-1')).toBeDefined();
    expect(await database.tasks.get('task-1')).toBeDefined();
  });

  it('edits, resolves, reopens, and archives the same stable record', async () => {
    const service = createService([
      'notice-1',
      'create-log',
      'edit-log',
      'resolve-log',
      'reopen-log',
      'archive-log',
    ]);
    await service.create({
      contextId: activeContext.id,
      kind: 'ongoing-support',
      title: 'Reading check-in',
    });

    const edited = await service.update('notice-1', {
      kind: 'learner-service',
      title: 'Reading intervention',
      details: 'Meet twice this week.',
    });
    expect(edited).toMatchObject({ id: 'notice-1', kind: 'learner-service' });

    expect(await service.resolve('notice-1')).toMatchObject({
      id: 'notice-1',
      status: 'resolved',
      resolvedAt: '2026-07-18T20:00:00.000Z',
    });
    expect(await service.reopen('notice-1')).toMatchObject({
      id: 'notice-1',
      status: 'active',
      resolvedAt: undefined,
    });
    expect(await service.archive('notice-1')).toMatchObject({
      id: 'notice-1',
      status: 'archived',
      archivedAt: '2026-07-18T20:00:00.000Z',
    });
  });

  it('rejects new records for archived contexts and blocks deletion when reminders or follow-up Tasks exist', async () => {
    const service = createService(['notice-1', 'task-1', 'log-1']);
    await expect(
      service.create({
        contextId: archivedContext.id,
        kind: 'ongoing-support',
        title: 'Should not save',
      }),
    ).rejects.toThrow('Archived learner contexts');

    await service.create({
      contextId: activeContext.id,
      kind: 'ongoing-support',
      title: 'Linked support',
      createFollowUpTask: true,
    });
    await database.reminders.put({
      id: 'reminder-1',
      sourceType: 'learner-notice',
      sourceId: 'notice-1',
      remindDate: '2026-07-20',
      remindMinute: 540,
      status: 'active',
      createdAt: '2026-07-18T20:00:00.000Z',
      updatedAt: '2026-07-18T20:00:00.000Z',
    });

    expect(await service.previewDelete('notice-1')).toEqual({
      noticeId: 'notice-1',
      noticeTitle: 'Linked support',
      reminders: 1,
      followUpTasks: 1,
      totalLinkedRecords: 2,
      canDelete: false,
    });
    await expect(service.delete('notice-1')).rejects.toThrow('cannot be deleted');
  });

  it('deletes only an unlinked notice and restores it through Undo/Redo', async () => {
    const service = createService(['notice-1', 'create-log', 'delete-log']);
    const history = new EditHistoryService(database, {
      now: () => '2026-07-18T21:00:00.000Z',
    });
    await service.create({
      contextId: activeContext.id,
      kind: 'ongoing-support',
      title: 'Temporary support',
    });

    expect(await service.previewDelete('notice-1')).toMatchObject({ canDelete: true });
    await service.delete('notice-1');
    expect(await database.learnerNotices.get('notice-1')).toBeUndefined();

    await history.undo();
    expect(await database.learnerNotices.get('notice-1')).toBeDefined();
    await history.redo();
    expect(await database.learnerNotices.get('notice-1')).toBeUndefined();
  });
});
