import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';
import { createLibraryApplicationLink } from '@/features/libraryCatalog/libraryApplicationModel';

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

  it('stores stable Library links and snapshots inside the reversible plan command', async () => {
    const resource = {
      id: 'resource-1',
      catalogType: 'resource' as const,
      title: 'Fraction cards',
      description: 'Reusable visual models.',
      tags: ['Math'],
      typedFields: {
        catalogType: 'resource' as const,
        sourceLocation: 'Binder A',
      },
      status: 'active' as const,
      createdAt: '2026-07-23T12:00:00.000Z',
      updatedAt: '2026-07-23T12:00:00.000Z',
    };
    const activity = {
      id: 'activity-1',
      catalogType: 'activity' as const,
      title: 'Partner explanation',
      tags: ['Speaking'],
      typedFields: {
        catalogType: 'activity' as const,
        grouping: 'partners' as const,
        estimatedMinutes: 8,
      },
      status: 'active' as const,
      createdAt: '2026-07-23T12:00:00.000Z',
      updatedAt: '2026-07-23T12:00:00.000Z',
    };
    await database.libraryItems.bulkPut([resource, activity]);

    const plan = await service.createPlan('context', {
      ...createLessonPlanEditorValues(),
      title: 'Library-linked lesson',
      libraryLinks: [createLibraryApplicationLink(resource)],
      lessonFlow: [
        {
          ...createLessonFlowStepEditorValues('guided-practice'),
          id: 'linked-step',
          title: 'Explain a model',
          libraryLinks: [
            createLibraryApplicationLink(activity, {
              captureSnapshot: true,
              capturedAt: '2026-07-23T12:30:00.000Z',
            }),
          ],
        },
      ],
    });

    expect(await database.lessonPlans.get(plan.id)).toMatchObject({
      libraryLinks: [{ libraryItemId: 'resource-1', catalogType: 'resource' }],
      lessonFlow: [
        {
          id: 'linked-step',
          libraryLinks: [
            {
              libraryItemId: 'activity-1',
              catalogType: 'activity',
              snapshot: { title: 'Partner explanation' },
            },
          ],
        },
      ],
    });
    expect(JSON.stringify((await database.lessonPlans.get(plan.id))?.libraryLinks)).not.toContain(
      'Fraction cards',
    );

    await history.undo();
    expect(await database.lessonPlans.get(plan.id)).toBeUndefined();

    await history.redo();
    expect(await database.lessonPlans.get(plan.id)).toMatchObject({
      libraryLinks: [{ libraryItemId: 'resource-1' }],
      lessonFlow: [{ libraryLinks: [{ libraryItemId: 'activity-1' }] }],
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

  it('swaps scheduled session slots when reordering adjacent lessons and restores both through undo', async () => {
    const first = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Scheduled lesson one',
      seriesMode: 'new',
      newSeriesTitle: 'Scheduled unit',
    });
    const series = (await database.lessonSeries.toArray())[0]!;
    const second = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Scheduled lesson two',
      seriesMode: 'existing',
      seriesId: series.id,
    });
    const firstSession = await service.schedulePlan(
      first.id,
      createSessionEditorValues('2026-07-17', 'block'),
    );
    const secondSession = await service.schedulePlan(
      second.id,
      createSessionEditorValues('2026-07-24', 'block'),
    );

    await service.movePlanWithinSeries(first.id, 'later');

    expect(await database.lessonPlans.get(first.id)).toMatchObject({ sequence: 1 });
    expect(await database.lessonPlans.get(second.id)).toMatchObject({ sequence: 0 });
    expect(await database.sessionOccurrences.get(firstSession.id)).toMatchObject({
      date: '2026-07-24',
      startMinute: 540,
      endMinute: 600,
      scheduleBlockId: 'block',
    });
    expect(await database.sessionOccurrences.get(secondSession.id)).toMatchObject({
      date: '2026-07-17',
      startMinute: 540,
      endMinute: 600,
      scheduleBlockId: 'block',
    });

    await history.undo();
    expect(await database.lessonPlans.get(first.id)).toMatchObject({ sequence: 0 });
    expect(await database.lessonPlans.get(second.id)).toMatchObject({ sequence: 1 });
    expect(await database.sessionOccurrences.get(firstSession.id)).toMatchObject({
      date: '2026-07-17',
    });
    expect(await database.sessionOccurrences.get(secondSession.id)).toMatchObject({
      date: '2026-07-24',
    });

    await history.redo();
    expect(await database.sessionOccurrences.get(firstSession.id)).toMatchObject({
      date: '2026-07-24',
    });
    expect(await database.sessionOccurrences.get(secondSession.id)).toMatchObject({
      date: '2026-07-17',
    });
  });

  it('rejects reordering when only one adjacent lesson is scheduled', async () => {
    const first = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Mixed lesson one',
      seriesMode: 'new',
      newSeriesTitle: 'Mixed unit',
    });
    const series = (await database.lessonSeries.toArray())[0]!;
    const second = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Mixed lesson two',
      seriesMode: 'existing',
      seriesId: series.id,
    });
    await service.schedulePlan(first.id, createSessionEditorValues('2026-07-17', 'block'));

    await expect(service.movePlanWithinSeries(first.id, 'later')).rejects.toThrow(
      'Both adjacent lessons must either be scheduled or unscheduled',
    );
    expect(await database.lessonPlans.get(first.id)).toMatchObject({ sequence: 0 });
    expect(await database.lessonPlans.get(second.id)).toMatchObject({ sequence: 1 });
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

  it('renames, archives, restores, and deletes a series without deleting teaching history', async () => {
    const first = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Lifecycle lesson one',
      seriesMode: 'new',
      newSeriesTitle: 'Lifecycle unit',
    });
    const series = (await database.lessonSeries.toArray())[0]!;
    const second = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Lifecycle lesson two',
      seriesMode: 'existing',
      seriesId: series.id,
    });
    const session = await service.schedulePlan(
      first.id,
      createSessionEditorValues('2026-07-17', 'block'),
    );
    await service.completeSession(session.id);

    await service.renameLessonSeries(series.id, 'Renamed lifecycle unit');
    expect(await database.lessonSeries.get(series.id)).toMatchObject({
      title: 'Renamed lifecycle unit',
      lifecycleState: 'active',
    });

    await service.archiveLessonSeries(series.id);
    expect(await database.lessonSeries.get(series.id)).toMatchObject({
      lifecycleState: 'archived',
    });
    await expect(
      service.createPlan('context', {
        ...createLessonPlanEditorValues(),
        title: 'Blocked archived assignment',
        seriesMode: 'existing',
        seriesId: series.id,
      }),
    ).rejects.toThrow('Restore this lesson series');

    await service.restoreLessonSeries(series.id);
    expect(await database.lessonSeries.get(series.id)).toMatchObject({
      lifecycleState: 'active',
      archivedAt: undefined,
    });

    await service.deleteLessonSeries(series.id);
    expect(await database.lessonSeries.get(series.id)).toBeUndefined();
    expect(await database.lessonPlans.get(first.id)).toMatchObject({
      seriesId: undefined,
      sequence: undefined,
    });
    expect(await database.lessonPlans.get(second.id)).toMatchObject({
      seriesId: undefined,
      sequence: undefined,
    });
    expect(await database.sessionOccurrences.get(session.id)).toMatchObject({
      lessonPlanId: first.id,
      deliveryState: 'completed',
    });

    await history.undo();
    expect(await database.lessonSeries.get(series.id)).toMatchObject({
      title: 'Renamed lifecycle unit',
      lifecycleState: 'active',
    });
    expect(await database.lessonPlans.get(first.id)).toMatchObject({
      seriesId: series.id,
      sequence: 0,
    });
    expect(await database.lessonPlans.get(second.id)).toMatchObject({
      seriesId: series.id,
      sequence: 1,
    });
    expect(await database.sessionOccurrences.get(session.id)).toMatchObject({
      deliveryState: 'completed',
    });

    await history.redo();
    expect(await database.lessonSeries.get(series.id)).toBeUndefined();
    expect(await database.sessionOccurrences.get(session.id)).toMatchObject({
      deliveryState: 'completed',
    });
  });

  it('creates one Plan and Session for a Schedule occurrence as one undoable command', async () => {
    await database.scheduleExceptions.put({
      id: 'occurrence-adjustment',
      date: '2026-07-17',
      scheduleBlockId: 'block',
      action: 'modify',
      replacementStartMinute: 600,
      replacementEndMinute: 675,
    });

    const result = await service.createPlanForScheduleOccurrence(
      'context',
      {
        ...createLessonPlanEditorValues(),
        title: 'Occurrence-first lesson',
        subject: 'Language',
        workflowState: 'ready',
      },
      { scheduleBlockId: 'block', date: '2026-07-17' },
    );

    expect(result.created).toBe(true);
    expect(result.plan).toMatchObject({
      contextId: 'context',
      preferredScheduleBlockId: 'block',
      title: 'Occurrence-first lesson',
    });
    expect(result.session).toMatchObject({
      lessonPlanId: result.plan.id,
      contextId: 'context',
      scheduleBlockId: 'block',
      date: '2026-07-17',
      startMinute: 600,
      endMinute: 675,
      deliveryState: 'scheduled',
    });
    expect(await database.lessonPlans.count()).toBe(1);
    expect(await database.sessionOccurrences.count()).toBe(1);
    expect(await database.changeLog.count()).toBe(1);

    await history.undo();
    expect(await database.lessonPlans.count()).toBe(0);
    expect(await database.sessionOccurrences.count()).toBe(0);

    await history.redo();
    expect(await database.lessonPlans.get(result.plan.id)).toMatchObject({
      title: 'Occurrence-first lesson',
    });
    expect(await database.sessionOccurrences.get(result.session.id)).toMatchObject({
      date: '2026-07-17',
      startMinute: 600,
      endMinute: 675,
    });
  });

  it('opens the existing Plan instead of duplicating the same occurrence and context', async () => {
    const first = await service.createPlanForScheduleOccurrence(
      'context',
      {
        ...createLessonPlanEditorValues(),
        title: 'Original occurrence plan',
      },
      { scheduleBlockId: 'block', date: '2026-07-17' },
    );
    const repeated = await service.createPlanForScheduleOccurrence(
      'context',
      {
        ...createLessonPlanEditorValues(),
        title: 'Duplicate attempt',
      },
      { scheduleBlockId: 'block', date: '2026-07-17' },
    );

    expect(repeated).toMatchObject({
      created: false,
      plan: { id: first.plan.id, title: 'Original occurrence plan' },
      session: { id: first.session.id },
    });
    expect(await database.lessonPlans.count()).toBe(1);
    expect(await database.sessionOccurrences.count()).toBe(1);
    expect(await database.changeLog.count()).toBe(1);
  });

  it('allows a different active context to use the same Schedule occurrence', async () => {
    await database.learnerContexts.put({
      id: 'group-context',
      kind: 'group',
      name: 'Synthetic group',
      schoolYearId: 'year',
      status: 'active',
    });

    const classResult = await service.createPlanForScheduleOccurrence(
      'context',
      { ...createLessonPlanEditorValues(), title: 'Class occurrence plan' },
      { scheduleBlockId: 'block', date: '2026-07-17' },
    );
    const groupResult = await service.createPlanForScheduleOccurrence(
      'group-context',
      { ...createLessonPlanEditorValues(), title: 'Group occurrence plan' },
      { scheduleBlockId: 'block', date: '2026-07-17' },
    );

    expect(classResult.created).toBe(true);
    expect(groupResult.created).toBe(true);
    expect(groupResult.plan.contextId).toBe('group-context');
    expect(groupResult.session).toMatchObject({
      contextId: 'group-context',
      scheduleBlockId: 'block',
      date: '2026-07-17',
    });
    expect(await database.lessonPlans.count()).toBe(2);
    expect(await database.sessionOccurrences.count()).toBe(2);
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

  it('deletes a plan with linked sessions as one reversible compound change', async () => {
    const first = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Delete lesson one',
      seriesMode: 'new',
      newSeriesTitle: 'Delete unit',
    });
    const series = (await database.lessonSeries.toArray())[0]!;
    const second = await service.createPlan('context', {
      ...createLessonPlanEditorValues('block'),
      title: 'Delete lesson two',
      seriesMode: 'existing',
      seriesId: series.id,
    });
    const session = await service.schedulePlan(
      first.id,
      createSessionEditorValues('2026-07-17', 'block'),
    );

    await expect(service.deletePlan(first.id)).rejects.toThrow(
      'Remove the scheduled session before deleting this plan',
    );

    await service.deletePlan(first.id, { includeSessions: true });
    expect(await database.lessonPlans.get(first.id)).toBeUndefined();
    expect(await database.sessionOccurrences.get(session.id)).toBeUndefined();
    expect(await database.lessonPlans.get(second.id)).toMatchObject({ sequence: 0 });

    await history.undo();
    expect(await database.lessonPlans.get(first.id)).toMatchObject({ sequence: 0 });
    expect(await database.lessonPlans.get(second.id)).toMatchObject({ sequence: 1 });
    expect(await database.sessionOccurrences.get(session.id)).toMatchObject({
      lessonPlanId: first.id,
      date: '2026-07-17',
      deliveryState: 'scheduled',
    });

    await history.redo();
    expect(await database.lessonPlans.get(first.id)).toBeUndefined();
    expect(await database.sessionOccurrences.get(session.id)).toBeUndefined();
    expect(await database.lessonPlans.get(second.id)).toMatchObject({ sequence: 0 });
  });

  it('requires an active learner context for new Plans and new Sessions', async () => {
    await database.learnerContexts.update('context', { status: 'archived' });

    await expect(
      service.createPlan('context', {
        ...createLessonPlanEditorValues(),
        title: 'Blocked archived plan',
      }),
    ).rejects.toThrow('Restore this learner context before creating a new plan.');

    await database.learnerContexts.update('context', { status: 'active' });
    const plan = await service.createPlan('context', {
      ...createLessonPlanEditorValues(),
      title: 'Existing plan',
    });
    await database.learnerContexts.update('context', { status: 'archived' });

    await expect(
      service.schedulePlan(plan.id, createSessionEditorValues('2026-07-17', 'block')),
    ).rejects.toThrow('Restore this learner context before scheduling a new session.');
  });
});
