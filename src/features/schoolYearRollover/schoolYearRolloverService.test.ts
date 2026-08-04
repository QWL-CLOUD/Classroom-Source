import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';
import { buildRestorePreview } from '@/features/backupRecovery/backupFormat';

import { SchoolYearRolloverService } from './schoolYearRolloverService';

let database: ClassroomDatabase;
let service: SchoolYearRolloverService;
let history: EditHistoryService;
let ids: string[];

beforeEach(async () => {
  database = new ClassroomDatabase(`instructional-rollover-${crypto.randomUUID()}`);
  await database.open();
  ids = [];
  service = new SchoolYearRolloverService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => '2027-07-01T12:00:00.000Z',
  });
  history = new EditHistoryService(database, { now: () => '2027-07-01T13:00:00.000Z' });

  await database.schoolYears.bulkPut([
    {
      id: 'source-year',
      label: '2026–2027',
      startsOn: '2026-08-24',
      endsOn: '2027-06-18',
      active: true,
      lifecycleState: 'active',
    },
    {
      id: 'target-year',
      label: '2027–2028',
      startsOn: '2027-08-23',
      endsOn: '2028-06-16',
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
      id: 'source-student',
      kind: 'individual',
      name: 'Student A',
      schoolYearId: 'source-year',
      status: 'active',
    },
  ]);
  await database.contextMemberships.put({
    id: 'source-membership',
    containerContextId: 'source-class',
    memberContextId: 'source-student',
  });
  await database.lessonSeries.put({
    id: 'source-series',
    contextId: 'source-class',
    title: 'Unit 1',
    subject: 'Chinese',
    lifecycleState: 'active',
  });
  await database.lessonPlans.put({
    id: 'source-plan',
    contextId: 'source-class',
    title: 'Lesson 1',
    subject: 'Chinese',
    workflowState: 'ready',
    seriesId: 'source-series',
    sequence: 0,
    lessonFlow: [{ id: 'source-step', title: 'Opening', phase: 'opening' }],
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
  });
  await database.sessionOccurrences.put({
    id: 'source-session',
    lessonPlanId: 'source-plan',
    contextId: 'source-class',
    date: '2026-09-01',
    startMinute: 540,
    endMinute: 600,
    deliveryState: 'completed',
    completedAt: '2026-09-01T15:00:00.000Z',
  });
  await database.standardAlignments.put({
    id: 'source-alignment',
    standardId: 'standard-1',
    targetType: 'lesson-plan',
    targetId: 'source-plan',
    lessonFlowStepId: 'source-step',
    scopeKey: 'lesson-plan:source-plan:step:source-step',
    createdAt: '2026-07-01T12:00:00.000Z',
  });
  await database.categoryValues.put({
    id: 'subject-ela',
    familyId: 'subject',
    name: 'English Language Arts',
    normalizedName: 'english language arts',
    aliases: [],
    normalizedAliases: [],
    sortOrder: 0,
    isDefault: false,
    lifecycleState: 'active',
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
  });
  await database.classificationMappingPresets.put({
    id: 'mapping-ela',
    familyId: 'subject',
    sourceText: 'ELA',
    normalizedSourceText: 'ela',
    targetCategoryValueId: 'subject-ela',
    status: 'active',
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:00:00.000Z',
  });
});

afterEach(async () => {
  await database.delete();
});

describe('SchoolYearRolloverService instructional repair', () => {
  it('copies instructional content, protects dates, excludes memberships and remains undoable', async () => {
    ids = [
      'target-class',
      'target-series',
      'target-step',
      'target-plan',
      'target-alignment',
      'snapshot-id',
      'snapshot-backup-id',
      'log-id',
    ];
    const beforeYears = await database.schoolYears.toArray();
    const preview = await service.preview({
      sourceSchoolYearId: 'source-year',
      targetSchoolYearId: 'target-year',
      selectedPlanIds: ['source-plan'],
      copySchedule: false,
      selectedScheduleBlockIds: [],
    });
    const result = await service.commit(preview);

    expect(result).toMatchObject({
      createdContextCount: 1,
      createdSeriesCount: 1,
      createdPlanCount: 1,
      createdStandardAlignmentCount: 1,
      safetySnapshot: { kind: 'pre-rollover' },
    });
    expect(await database.lessonPlans.get('target-plan')).toMatchObject({
      contextId: 'target-class',
      seriesId: 'target-series',
      workflowState: 'draft',
      rolledOverFromPlanId: 'source-plan',
    });
    expect(await database.standardAlignments.get('target-alignment')).toMatchObject({
      targetId: 'target-plan',
      lessonFlowStepId: 'target-step',
    });
    expect(await database.contextMemberships.count()).toBe(1);
    expect(await database.sessionOccurrences.count()).toBe(1);
    expect(await database.schoolYears.toArray()).toEqual(beforeYears);

    expect(await database.classificationMappingPresets.get('mapping-ela')).toMatchObject({
      targetCategoryValueId: 'subject-ela',
      status: 'active',
    });
    const safetyPreview = buildRestorePreview(result.safetySnapshot.payloadJson);
    expect(safetyPreview.validTables.classificationMappingPresets).toHaveLength(1);

    await history.undo();
    expect(await database.lessonPlans.get('target-plan')).toBeUndefined();
    expect(await database.lessonSeries.get('target-series')).toBeUndefined();
    expect(await database.learnerContexts.get('target-class')).toBeUndefined();
    expect(await database.contextMemberships.count()).toBe(1);
    expect(await database.sessionOccurrences.count()).toBe(1);
    expect(await database.schoolYears.toArray()).toEqual(beforeYears);

    await history.redo();
    expect(await database.lessonPlans.get('target-plan')).toBeDefined();
    expect(await database.schoolYears.toArray()).toEqual(beforeYears);
    expect(await database.classificationMappingPresets.get('mapping-ela')).toBeDefined();
  });

  it('rejects a stale preview before creating a safety snapshot', async () => {
    ids = ['target-class', 'target-series', 'target-step', 'target-plan', 'target-alignment'];
    const preview = await service.preview({
      sourceSchoolYearId: 'source-year',
      targetSchoolYearId: 'target-year',
      selectedPlanIds: ['source-plan'],
      copySchedule: false,
      selectedScheduleBlockIds: [],
    });
    await database.schoolYears.update('source-year', { startsOn: '2026-08-25' });
    await expect(service.commit(preview)).rejects.toThrow(/Generate a new preview/);
    expect(await database.backupSnapshots.count()).toBe(0);
    expect(
      (await database.lessonPlans.toArray()).filter((plan) => plan.contextId !== 'source-class'),
    ).toEqual([]);
  });

  it('rolls back the safety snapshot and copied records if a plan write fails', async () => {
    ids = [
      'target-class',
      'target-series',
      'target-step',
      'target-plan',
      'target-alignment',
      'snapshot-id',
      'snapshot-backup-id',
      'log-id',
    ];
    const preview = await service.preview({
      sourceSchoolYearId: 'source-year',
      targetSchoolYearId: 'target-year',
      selectedPlanIds: ['source-plan'],
      copySchedule: false,
      selectedScheduleBlockIds: [],
    });
    database.lessonPlans.hook('creating', () => {
      throw new Error('Synthetic instructional rollover failure');
    });
    await expect(service.commit(preview)).rejects.toThrow(
      /Synthetic instructional rollover failure/,
    );
    expect(await database.backupSnapshots.count()).toBe(0);
    expect(await database.changeLog.count()).toBe(0);
    expect(await database.lessonPlans.count()).toBe(1);
    expect(await database.lessonSeries.count()).toBe(1);
    expect(await database.learnerContexts.count()).toBe(2);
  });
});
