import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import type { LearnerContext } from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { LearnerContextMutationService } from './learnerContextMutationService';

let database: ClassroomDatabase;

const activeContext: LearnerContext = {
  id: 'context-active',
  kind: 'class',
  name: 'Synthetic Grade 3',
  preferredName: 'Grade 3',
  schoolYearId: 'school-year-current',
  status: 'active',
  notes: 'Original notes',
};

beforeEach(async () => {
  database = new ClassroomDatabase(`learner-context-lifecycle-${crypto.randomUUID()}`);
  await database.open();
  await database.learnerContexts.put(activeContext);
});

afterEach(async () => {
  await database.delete();
});

function createService(ids: string[]): LearnerContextMutationService {
  return new LearnerContextMutationService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => '2026-07-18T20:00:00.000Z',
  });
}

describe('LearnerContextMutationService', () => {
  it('creates an active learner context in the selected school year and supports Undo/Redo', async () => {
    await database.schoolYears.put({
      id: 'school-year-current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
      lifecycleState: 'active',
    });
    const service = createService(['created-context', 'create-log']);
    const history = new EditHistoryService(database, {
      now: () => '2026-07-18T21:00:00.000Z',
    });

    const created = await service.create({
      kind: 'individual',
      schoolYearId: 'school-year-current',
      name: '  Anna Wang  ',
      preferredName: '  Anna  ',
      notes: '  Reading support  ',
    });

    expect(created).toEqual({
      id: 'created-context',
      kind: 'individual',
      name: 'Anna Wang',
      preferredName: 'Anna',
      schoolYearId: 'school-year-current',
      status: 'active',
      notes: 'Reading support',
    });
    expect(await database.changeLog.get('create-log')).toMatchObject({
      commandType: 'learner-context.create',
      label: 'Add Individual “Anna Wang”',
    });

    await history.undo();
    expect(await database.learnerContexts.get(created.id)).toBeUndefined();
    await history.redo();
    expect(await database.learnerContexts.get(created.id)).toEqual(created);
  });

  it('prevents duplicate names within the same kind and rejects archived school years', async () => {
    await database.schoolYears.bulkPut([
      {
        id: 'school-year-current',
        label: '2026–2027',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        active: true,
        lifecycleState: 'active',
      },
      {
        id: 'school-year-archived',
        label: '2025–2026',
        startsOn: '2025-07-01',
        endsOn: '2026-06-30',
        active: false,
        lifecycleState: 'archived',
        archivedAt: '2026-07-01T00:00:00.000Z',
      },
    ]);
    await database.learnerContexts.put({
      id: 'duplicate-individual',
      kind: 'individual',
      name: 'Anna Wang',
      schoolYearId: 'school-year-current',
      status: 'archived',
    });
    const service = createService(['unused-context', 'unused-log']);

    await expect(
      service.create({
        kind: 'individual',
        schoolYearId: 'school-year-current',
        name: ' anna wang ',
      }),
    ).rejects.toThrow('already exists');
    await expect(
      service.create({
        kind: 'group',
        schoolYearId: 'school-year-archived',
        name: 'Archived group',
      }),
    ).rejects.toThrow('Restore this school year');
    expect(await database.changeLog.count()).toBe(0);
  });
  it('edits profile fields without changing the stable ID or historical links and supports Undo/Redo', async () => {
    await database.lessonPlans.put({
      id: 'linked-plan',
      contextId: activeContext.id,
      title: 'Linked plan',
      subject: 'Math',
      workflowState: 'ready',
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });
    const service = createService(['update-log']);
    const history = new EditHistoryService(database, {
      now: () => '2026-07-18T21:00:00.000Z',
    });

    const updated = await service.update(activeContext.id, {
      name: '  Renamed Grade 3  ',
      preferredName: '  Third Grade  ',
      notes: '  Updated notes  ',
    });

    expect(updated).toMatchObject({
      id: activeContext.id,
      kind: 'class',
      schoolYearId: activeContext.schoolYearId,
      status: 'active',
      name: 'Renamed Grade 3',
      preferredName: 'Third Grade',
      notes: 'Updated notes',
    });
    expect((await database.lessonPlans.get('linked-plan'))?.contextId).toBe(activeContext.id);

    await history.undo();
    expect(await database.learnerContexts.get(activeContext.id)).toEqual(activeContext);
    expect((await database.lessonPlans.get('linked-plan'))?.contextId).toBe(activeContext.id);

    await history.redo();
    expect(await database.learnerContexts.get(activeContext.id)).toMatchObject({
      id: activeContext.id,
      name: 'Renamed Grade 3',
    });
  });

  it('archives and restores the same learner-context record', async () => {
    const service = createService(['archive-log', 'restore-log']);
    const history = new EditHistoryService(database, {
      now: () => '2026-07-18T21:00:00.000Z',
    });

    const archived = await service.archive(activeContext.id);
    expect(archived).toMatchObject({ id: activeContext.id, status: 'archived' });

    await history.undo();
    expect((await database.learnerContexts.get(activeContext.id))?.status).toBe('active');
    await history.redo();
    expect((await database.learnerContexts.get(activeContext.id))?.status).toBe('archived');

    const restored = await service.restore(activeContext.id);
    expect(restored).toMatchObject({ id: activeContext.id, status: 'active' });
  });

  it('reports every linked-record category and blocks destructive deletion', async () => {
    await database.contextMemberships.bulkPut([
      {
        id: 'membership-container',
        containerContextId: activeContext.id,
        memberContextId: 'another-context',
      },
      {
        id: 'membership-member',
        containerContextId: 'another-context',
        memberContextId: activeContext.id,
      },
    ]);
    await database.scheduleBlocks.put({
      id: 'linked-block',
      contextId: activeContext.id,
      title: 'Linked block',
      subject: '',
      category: 'Teaching',
      kind: 'teachable',
      weekdays: [1],
      startMinute: 540,
      endMinute: 600,
      planningEnabled: true,
      bumpEnabled: true,
      showInWeek: true,
      sortOrder: 0,
    });
    await database.calendarEvents.put({
      id: 'linked-event',
      title: 'Linked event',
      startDate: '2026-07-20',
      category: 'Calendar',
      contextId: activeContext.id,
    });
    await database.lessonSeries.put({
      id: 'linked-series',
      contextId: activeContext.id,
      title: 'Linked series',
      subject: 'Math',
      lifecycleState: 'active',
    });
    await database.lessonPlans.put({
      id: 'linked-plan',
      contextId: activeContext.id,
      title: 'Linked plan',
      subject: 'Math',
      workflowState: 'ready',
      seriesId: 'linked-series',
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });
    await database.sessionOccurrences.put({
      id: 'linked-session',
      lessonPlanId: 'linked-plan',
      contextId: activeContext.id,
      date: '2026-07-20',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'completed',
      completedAt: '2026-07-20T15:00:00.000Z',
    });
    await database.tasks.put({
      id: 'linked-task',
      title: 'Linked task',
      status: 'active',
      contextId: activeContext.id,
      order: 0,
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
    });
    const service = createService(['blocked-log']);

    const impact = await service.previewDelete(activeContext.id);

    expect(impact).toEqual({
      contextId: activeContext.id,
      contextName: activeContext.name,
      memberships: 2,
      scheduleBlocks: 1,
      calendarEvents: 1,
      lessonSeries: 1,
      lessonPlans: 1,
      sessions: 1,
      tasks: 1,
      learnerNotices: 0,
      totalLinkedRecords: 8,
      canDelete: false,
    });
    await expect(service.delete(activeContext.id)).rejects.toThrow(
      'cannot be deleted because it is linked to',
    );
    expect(await database.learnerContexts.get(activeContext.id)).toEqual(activeContext);
    expect(await database.changeLog.count()).toBe(0);
  });

  it('deletes only an empty context and restores it through one Undo/Redo command', async () => {
    const service = createService(['delete-log']);
    const history = new EditHistoryService(database, {
      now: () => '2026-07-18T21:00:00.000Z',
    });

    expect(await service.previewDelete(activeContext.id)).toMatchObject({
      canDelete: true,
      totalLinkedRecords: 0,
    });
    await service.delete(activeContext.id);
    expect(await database.learnerContexts.get(activeContext.id)).toBeUndefined();

    await history.undo();
    expect(await database.learnerContexts.get(activeContext.id)).toEqual(activeContext);

    await history.redo();
    expect(await database.learnerContexts.get(activeContext.id)).toBeUndefined();
  });
});
