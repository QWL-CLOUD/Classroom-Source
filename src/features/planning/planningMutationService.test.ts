import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import {
  createLessonFlowStepEditorValues,
  createLessonPlanEditorValues,
  createSessionEditorValues,
  toSessionEditorValues,
} from './planningEditorModel';
import { PlanningMutationService } from './planningMutationService';

let database: ClassroomDatabase;
let service: PlanningMutationService;
let history: EditHistoryService;
let idSequence: number;
let timeSequence: number;

function createId(): string {
  idSequence += 1;
  return `phase-3c-id-${idSequence}`;
}

function now(): string {
  timeSequence += 1;
  return `2026-07-17T12:00:${timeSequence.toString().padStart(2, '0')}.000Z`;
}

beforeEach(async () => {
  idSequence = 0;
  timeSequence = 0;
  database = new ClassroomDatabase(`phase-3c-${crypto.randomUUID()}`);
  await database.open();
  service = new PlanningMutationService(database, { createId, now });
  history = new EditHistoryService(database, { now });
  await database.learnerContexts.put({
    id: 'context',
    kind: 'class',
    name: 'Synthetic class',
    schoolYearId: 'year',
    status: 'active',
  });
  await database.scheduleBlocks.put({
    id: 'block',
    contextId: 'context',
    title: 'Language block',
    subject: 'Language',
    category: 'Teaching',
    kind: 'teachable',
    weekdays: [5],
    startMinute: 540,
    endMinute: 600,
    planningEnabled: true,
    bumpEnabled: false,
    showInWeek: true,
    sortOrder: 0,
  });
});

afterEach(async () => {
  await database.delete();
});

describe('planning mutation service', () => {
  it('creates a plan, inherits schedule time, completes, and participates in undo/redo', async () => {
    const plan = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Synthetic language lesson',
      subject: 'Language',
      workflowState: 'ready',
    });

    const session = await service.schedulePlan(plan.id, {
      ...createSessionEditorValues('2026-07-17', 'block'),
      startTime: '01:00',
      endTime: '02:00',
    });

    expect(session).toMatchObject({
      lessonPlanId: plan.id,
      scheduleBlockId: 'block',
      date: '2026-07-17',
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'scheduled',
    });

    await service.completeSession(session.id);
    expect((await database.sessionOccurrences.get(session.id))?.deliveryState).toBe('completed');

    await history.undo();
    expect((await database.sessionOccurrences.get(session.id))?.deliveryState).toBe('scheduled');

    await history.redo();
    expect((await database.sessionOccurrences.get(session.id))?.deliveryState).toBe('completed');
  });

  it('stores a session override independently and restores it through undo', async () => {
    const plan = await service.createPlan('context', {
      ...createLessonPlanEditorValues(),
      title: 'Flow lesson',
      lessonFlow: [
        {
          ...createLessonFlowStepEditorValues('opening'),
          id: 'opening-step',
          title: 'Plan opening',
          durationMinutes: '8',
        },
      ],
    });
    const session = await service.schedulePlan(
      plan.id,
      createSessionEditorValues('2026-07-17', 'block', 540, 600, plan),
    );
    expect(session.contentOverride).toBeUndefined();

    const customValues = toSessionEditorValues(session, plan);
    customValues.contentMode = 'custom';
    customValues.lessonFlow[0]!.title = 'Session opening';
    await service.updateSession(session.id, customValues);

    expect(await database.sessionOccurrences.get(session.id)).toMatchObject({
      contentOverride: {
        lessonFlow: [{ title: 'Session opening' }],
      },
    });

    await history.undo();
    expect((await database.sessionOccurrences.get(session.id))?.contentOverride).toBeUndefined();

    await history.redo();
    expect(await database.sessionOccurrences.get(session.id)).toMatchObject({
      contentOverride: {
        lessonFlow: [{ title: 'Session opening' }],
      },
    });
  });

  it('creates and reorders one lesson series with reversible compound history', async () => {
    const first = await service.createPlan('context', {
      ...createLessonPlanEditorValues(),
      title: 'Lesson one',
      seriesMode: 'new',
      newSeriesTitle: 'Synthetic unit',
    });
    const series = (await database.lessonSeries.toArray())[0]!;
    const second = await service.createPlan('context', {
      ...createLessonPlanEditorValues(),
      title: 'Lesson two',
      seriesMode: 'existing',
      seriesId: series.id,
    });

    expect(
      (await database.lessonPlans.toArray()).sort(
        (a, b) => (a.sequence ?? 999) - (b.sequence ?? 999),
      ),
    ).toMatchObject([
      { id: first.id, seriesId: series.id, sequence: 0 },
      { id: second.id, seriesId: series.id, sequence: 1 },
    ]);

    await service.movePlanWithinSeries(second.id, 'earlier');
    expect(
      (await database.lessonPlans.toArray()).sort(
        (a, b) => (a.sequence ?? 999) - (b.sequence ?? 999),
      ),
    ).toMatchObject([
      { id: second.id, sequence: 0 },
      { id: first.id, sequence: 1 },
    ]);

    await history.undo();
    expect(
      (await database.lessonPlans.toArray()).sort(
        (a, b) => (a.sequence ?? 999) - (b.sequence ?? 999),
      ),
    ).toMatchObject([
      { id: first.id, sequence: 0 },
      { id: second.id, sequence: 1 },
    ]);

    await history.redo();
    expect(
      (await database.lessonPlans.toArray()).sort(
        (a, b) => (a.sequence ?? 999) - (b.sequence ?? 999),
      ),
    ).toMatchObject([
      { id: second.id, sequence: 0 },
      { id: first.id, sequence: 1 },
    ]);
  });

  it('creates a new series atomically and removes it when the plan creation is undone', async () => {
    await service.createPlan('context', {
      ...createLessonPlanEditorValues(),
      title: 'Atomic series lesson',
      subject: 'Language',
      seriesMode: 'new',
      newSeriesTitle: 'Atomic unit',
    });

    expect(await database.lessonSeries.toArray()).toMatchObject([
      { title: 'Atomic unit', subject: 'Language', contextId: 'context' },
    ]);
    expect(await database.lessonPlans.toArray()).toMatchObject([
      { title: 'Atomic series lesson', sequence: 0 },
    ]);

    await history.undo();
    expect(await database.lessonSeries.count()).toBe(0);
    expect(await database.lessonPlans.count()).toBe(0);

    await history.redo();
    expect(await database.lessonSeries.count()).toBe(1);
    expect(await database.lessonPlans.count()).toBe(1);
  });

  it('does not overwrite an existing plan when a generated ID collides', async () => {
    const collisionService = new PlanningMutationService(database, {
      createId: () => 'fixed-plan-id',
      now,
    });
    const first = await collisionService.createPlan('context', {
      ...createLessonPlanEditorValues(),
      title: 'First plan',
    });

    await expect(
      collisionService.createPlan('context', {
        ...createLessonPlanEditorValues(),
        title: 'Second plan',
      }),
    ).rejects.toThrow('Lesson plan ID already exists');

    expect(await database.lessonPlans.get(first.id)).toMatchObject({
      title: 'First plan',
    });
    expect(await database.lessonPlans.count()).toBe(1);
  });

  it('uses an occurrence exception when inheriting schedule time', async () => {
    await database.scheduleExceptions.put({
      id: 'exception',
      date: '2026-07-17',
      scheduleBlockId: 'block',
      action: 'modify',
      replacementStartMinute: 600,
      replacementEndMinute: 660,
    });
    const plan = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Adjusted lesson',
    });

    const session = await service.schedulePlan(
      plan.id,
      createSessionEditorValues('2026-07-17', 'block'),
    );

    expect(session).toMatchObject({ startMinute: 600, endMinute: 660 });
  });

  it('rejects a schedule block that does not occur on the selected date', async () => {
    const plan = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Wrong day lesson',
    });

    await expect(
      service.schedulePlan(plan.id, createSessionEditorValues('2026-07-18', 'block')),
    ).rejects.toThrow('does not occur on this date');
    expect(await database.sessionOccurrences.count()).toBe(0);
  });

  it('returns a session to Unscheduled with reversible history', async () => {
    const plan = await service.createPlan('context', {
      ...createLessonPlanEditorValues(),
      title: 'Manual lesson',
    });
    const session = await service.schedulePlan(
      plan.id,
      createSessionEditorValues('2026-07-18', '', 600, 660),
    );

    await service.unscheduleSession(session.id);
    expect(await database.sessionOccurrences.get(session.id)).toBeUndefined();

    await history.undo();
    expect(await database.sessionOccurrences.get(session.id)).toMatchObject({
      deliveryState: 'scheduled',
    });
  });

  it('previews and commits one atomic series bump across schedule exceptions', async () => {
    await database.scheduleBlocks.update('block', {
      bumpEnabled: true,
      effectiveFrom: '2026-07-01',
      effectiveTo: '2026-08-31',
    });
    await database.scheduleExceptions.bulkPut([
      {
        id: 'cancel-friday',
        date: '2026-07-24',
        scheduleBlockId: 'block',
        action: 'cancel',
      },
      {
        id: 'add-saturday',
        date: '2026-07-25',
        scheduleBlockId: 'block',
        action: 'add',
        replacementStartMinute: 600,
        replacementEndMinute: 660,
      },
    ]);

    const firstPlan = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Bump lesson one',
      workflowState: 'ready',
      seriesMode: 'new',
      newSeriesTitle: 'Bump unit',
    });
    const series = (await database.lessonSeries.toArray())[0]!;
    const secondPlan = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Bump lesson two',
      workflowState: 'ready',
      seriesMode: 'existing',
      seriesId: series.id,
    });
    const firstSession = await service.schedulePlan(
      firstPlan.id,
      createSessionEditorValues('2026-07-17', 'block'),
    );
    const secondSession = await service.schedulePlan(
      secondPlan.id,
      createSessionEditorValues('2026-07-31', 'block'),
    );

    const preview = await service.previewSeriesBump(firstSession.id);
    expect(preview.canCommit).toBe(true);
    expect(preview.items).toMatchObject([
      { sessionId: firstSession.id, fromDate: '2026-07-17', toDate: '2026-07-25' },
      { sessionId: secondSession.id, fromDate: '2026-07-31', toDate: '2026-08-07' },
    ]);

    await service.bumpSeries(firstSession.id, preview.previewToken);
    expect(await database.sessionOccurrences.get(firstSession.id)).toMatchObject({
      date: '2026-07-25',
      startMinute: 600,
      endMinute: 660,
    });
    expect(await database.sessionOccurrences.get(secondSession.id)).toMatchObject({
      date: '2026-08-07',
      startMinute: 540,
      endMinute: 600,
    });

    await history.undo();
    expect(await database.sessionOccurrences.get(firstSession.id)).toMatchObject({
      date: '2026-07-17',
      startMinute: 540,
      endMinute: 600,
    });
    expect(await database.sessionOccurrences.get(secondSession.id)).toMatchObject({
      date: '2026-07-31',
    });

    await history.redo();
    expect(await database.sessionOccurrences.get(firstSession.id)).toMatchObject({
      date: '2026-07-25',
    });
    expect(await database.sessionOccurrences.get(secondSession.id)).toMatchObject({
      date: '2026-08-07',
    });
  });
});
