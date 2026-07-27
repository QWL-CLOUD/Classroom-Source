import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { SchoolYearRolloverService } from './schoolYearRolloverService';

let database: ClassroomDatabase;
let service: SchoolYearRolloverService;
let history: EditHistoryService;
let idQueue: string[];

beforeEach(async () => {
  database = new ClassroomDatabase(`advanced-rollover-${crypto.randomUUID()}`);
  await database.open();
  idQueue = [];
  service = new SchoolYearRolloverService(database, {
    createId: () => idQueue.shift() ?? crypto.randomUUID(),
    now: () => '2026-07-27T18:00:00.000Z',
  });
  history = new EditHistoryService(database, { now: () => '2026-07-27T19:00:00.000Z' });
  await database.schoolYears.bulkPut([
    {
      id: 'source-year',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
      lifecycleState: 'active',
    },
    {
      id: 'target-year',
      label: '2027–2028',
      startsOn: '2027-07-01',
      endsOn: '2028-06-30',
      active: false,
      lifecycleState: 'active',
    },
  ]);
  await database.learnerContexts.bulkPut([
    {
      id: 'source-class',
      kind: 'class',
      name: 'Grade 3',
      schoolYearId: 'source-year',
      status: 'active',
    },
    {
      id: 'source-learner',
      kind: 'individual',
      name: 'Avery',
      schoolYearId: 'source-year',
      status: 'active',
    },
  ]);
  await database.contextMemberships.put({
    id: 'source-membership',
    containerContextId: 'source-class',
    memberContextId: 'source-learner',
  });
  await database.scheduleBlocks.put({
    id: 'source-schedule',
    contextId: 'source-class',
    title: 'Math',
    subject: 'Math',
    category: 'Teaching',
    kind: 'teachable',
    weekdays: [1],
    startMinute: 540,
    endMinute: 600,
    effectiveFrom: '2026-07-01',
    effectiveTo: '2027-06-30',
    planningEnabled: true,
    bumpEnabled: true,
    showInWeek: true,
    sortOrder: 0,
  });
});

afterEach(async () => {
  await database.delete();
});

describe('SchoolYearRolloverService', () => {
  it('commits one protected transaction and remains globally undoable and redoable', async () => {
    idQueue = [
      'target-class',
      'target-learner',
      'target-membership',
      'target-schedule',
      'snapshot-id',
      'snapshot-backup-id',
      'log-id',
    ];
    const preview = await service.preview({
      sourceSchoolYearId: 'source-year',
      targetSchoolYearId: 'target-year',
      selectedContextIds: ['source-class', 'source-learner'],
      copySchedule: true,
      selectedScheduleBlockIds: ['source-schedule'],
    });

    const result = await service.commit(preview);

    expect(result).toMatchObject({
      createdContextCount: 2,
      createdMembershipCount: 1,
      createdScheduleBlockCount: 1,
      safetySnapshot: { kind: 'pre-rollover' },
    });
    expect(await database.learnerContexts.get('target-class')).toMatchObject({
      schoolYearId: 'target-year',
    });
    expect(await database.contextMemberships.get('target-membership')).toMatchObject({
      containerContextId: 'target-class',
      memberContextId: 'target-learner',
    });
    expect(await database.scheduleBlocks.get('target-schedule')).toMatchObject({
      contextId: 'target-class',
      effectiveFrom: '2027-07-01',
      effectiveTo: '2028-06-30',
    });
    expect(await database.schoolYears.get('target-year')).toMatchObject({ active: false });

    await history.undo();
    expect(await database.learnerContexts.get('target-class')).toBeUndefined();
    expect(await database.contextMemberships.get('target-membership')).toBeUndefined();
    expect(await database.scheduleBlocks.get('target-schedule')).toBeUndefined();
    expect(await database.backupSnapshots.get(result.safetySnapshot.id)).toBeDefined();

    await history.redo();
    expect(await database.learnerContexts.get('target-class')).toBeDefined();
    expect(await database.scheduleBlocks.get('target-schedule')).toBeDefined();
  });

  it('rejects a stale preview before creating a safety snapshot or user records', async () => {
    idQueue = ['target-class'];
    const preview = await service.preview({
      sourceSchoolYearId: 'source-year',
      targetSchoolYearId: 'target-year',
      selectedContextIds: ['source-class'],
      copySchedule: false,
      selectedScheduleBlockIds: [],
    });
    await database.learnerContexts.update('source-class', { name: 'Grade 3 updated' });

    await expect(service.commit(preview)).rejects.toThrow(/Generate a new preview/);
    expect(await database.backupSnapshots.count()).toBe(0);
    expect(
      (await database.learnerContexts.toArray()).filter(
        (value) => value.schoolYearId === 'target-year',
      ),
    ).toEqual([]);
  });

  it('rolls back the safety snapshot and copied records if a rollover write fails', async () => {
    idQueue = ['target-class', 'snapshot-id', 'snapshot-backup-id', 'log-id'];
    const preview = await service.preview({
      sourceSchoolYearId: 'source-year',
      targetSchoolYearId: 'target-year',
      selectedContextIds: ['source-class'],
      copySchedule: false,
      selectedScheduleBlockIds: [],
    });
    database.learnerContexts.hook('creating', (primaryKey, record) => {
      void primaryKey;
      if (record.schoolYearId === 'target-year') throw new Error('Synthetic rollover failure');
    });

    await expect(service.commit(preview)).rejects.toThrow(/Synthetic rollover failure/);
    expect(await database.backupSnapshots.count()).toBe(0);
    expect(await database.changeLog.count()).toBe(0);
    expect(
      (await database.learnerContexts.toArray()).filter(
        (value) => value.schoolYearId === 'target-year',
      ),
    ).toEqual([]);
  });
});
