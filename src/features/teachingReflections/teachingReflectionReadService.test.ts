import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';

import { TeachingReflectionReadService } from './teachingReflectionReadService';

let database: ClassroomDatabase;
let read: TeachingReflectionReadService;

const now = '2026-09-02T12:00:00.000Z';

beforeEach(async () => {
  database = new ClassroomDatabase(`teaching-reflection-read-${crypto.randomUUID()}`);
  await database.open();
  read = new TeachingReflectionReadService(database);

  await database.schoolYears.put({
    id: 'year-1',
    label: '2026–2027',
    startsOn: '2026-08-24',
    endsOn: '2027-06-18',
    active: true,
  });
  await database.learnerContexts.put({
    id: 'class-1',
    kind: 'class',
    name: 'Grade 3 Chinese',
    schoolYearId: 'year-1',
    status: 'active',
  });
  await database.lessonPlans.put({
    id: 'plan-1',
    contextId: 'class-1',
    title: 'Reading workshop',
    subject: 'Chinese',
    workflowState: 'ready',
    createdAt: now,
    updatedAt: now,
  });
  await database.sessionOccurrences.put({
    id: 'session-1',
    lessonPlanId: 'plan-1',
    contextId: 'class-1',
    date: '2026-09-01',
    startMinute: 540,
    endMinute: 600,
    deliveryState: 'completed',
    completedAt: now,
    reflectionId: 'reflection-1',
  });
  await database.teachingReflections.put({
    id: 'reflection-1',
    sessionOccurrenceId: 'session-1',
    schoolYearId: 'year-1',
    contextId: 'class-1',
    lessonPlanId: 'plan-1',
    occurredOn: '2026-09-01',
    whatWorked: 'Learners used the target language independently.',
    sourceSnapshots: {
      context: { kind: 'class', name: 'Grade 3 Chinese' },
      lessonPlan: { title: 'Reading workshop' },
      sessionOccurrence: { date: '2026-09-01', startMinute: 540, endMinute: 600 },
    },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
});

afterEach(async () => {
  await database.delete();
});

describe('TeachingReflectionReadService', () => {
  it('loads a Reflection by ID with current source availability', async () => {
    const model = await read.getReflection('reflection-1');

    expect(model).toMatchObject({
      reflection: { id: 'reflection-1' },
      source: {
        schoolYear: { state: 'available', current: { id: 'year-1' } },
        context: { state: 'available', current: { id: 'class-1' } },
        lessonPlan: { state: 'available', current: { id: 'plan-1' } },
        sessionOccurrence: { state: 'completed', linkState: 'linked' },
        warnings: [],
      },
    });
  });

  it('loads the same one-to-one Reflection through the Session identity index', async () => {
    expect((await read.getSessionReflection('session-1'))?.reflection.id).toBe('reflection-1');
    await expect(read.getSessionReflection('missing-session')).resolves.toBeUndefined();
  });

  it('returns exact Session Evidence and exact Reflection-linked Next Step Tasks', async () => {
    await database.studentRecords.put({
      id: 'student-1',
      name: 'Ari Chen',
      preferredName: 'Ari',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await database.assessmentEvidence.bulkPut([
      {
        id: 'evidence-1',
        studentId: 'student-1',
        schoolYearId: 'year-1',
        occurredOn: '2026-09-01',
        title: 'Session observation',
        kind: 'observation',
        observation: { text: 'Used the target language.' },
        sessionOccurrenceId: 'session-1',
        standardIds: [],
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'evidence-other',
        studentId: 'student-2',
        schoolYearId: 'year-1',
        occurredOn: '2026-09-01',
        title: 'Other Session',
        kind: 'observation',
        observation: { text: 'Unrelated.' },
        sessionOccurrenceId: 'session-2',
        standardIds: [],
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await database.tasks.bulkPut([
      {
        id: 'task-1',
        title: 'Prepare the visual model',
        status: 'active',
        linkedEntityType: 'teaching-reflection',
        linkedEntityId: 'reflection-1',
        contextId: 'class-1',
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'task-other',
        title: 'Other Reflection',
        status: 'active',
        linkedEntityType: 'teaching-reflection',
        linkedEntityId: 'reflection-2',
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const model = await read.getReflection('reflection-1');
    expect(model?.relatedEvidence.records.map((record) => record.id)).toEqual(['evidence-1']);
    expect(model?.relatedEvidence.items[0]?.student).toMatchObject({ name: 'Ari Chen' });
    expect(model?.nextSteps.tasks.map((task) => task.id)).toEqual(['task-1']);
  });

  it('keeps snapshots readable and reports unavailable sources after source deletion', async () => {
    await database.transaction(
      'rw',
      database.schoolYears,
      database.learnerContexts,
      database.lessonPlans,
      database.sessionOccurrences,
      async () => {
        await database.schoolYears.delete('year-1');
        await database.learnerContexts.delete('class-1');
        await database.lessonPlans.delete('plan-1');
        await database.sessionOccurrences.delete('session-1');
      },
    );

    const model = await read.getReflection('reflection-1');
    expect(model?.source.warnings).toEqual([
      'school-year-source-unavailable',
      'context-source-unavailable',
      'lesson-plan-source-unavailable',
      'session-source-unavailable',
    ]);
    expect(model?.source.context.snapshot.name).toBe('Grade 3 Chinese');
    expect(model?.source.lessonPlan.snapshot.title).toBe('Reading workshop');
  });

  it('lists School Year records newest first with lifecycle filtering', async () => {
    await database.teachingReflections.bulkPut([
      {
        id: 'reflection-newer',
        sessionOccurrenceId: 'session-newer',
        schoolYearId: 'year-1',
        contextId: 'class-1',
        lessonPlanId: 'plan-1',
        occurredOn: '2026-09-10',
        whatToAdjust: 'Use a shorter prompt.',
        sourceSnapshots: {
          context: { kind: 'class', name: 'Grade 3 Chinese' },
          lessonPlan: { title: 'Newer lesson' },
          sessionOccurrence: { date: '2026-09-10', startMinute: 540, endMinute: 600 },
        },
        status: 'archived',
        archivedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'reflection-other-year',
        sessionOccurrenceId: 'session-other-year',
        schoolYearId: 'year-2',
        contextId: 'class-2',
        lessonPlanId: 'plan-2',
        occurredOn: '2026-09-20',
        additionalNotes: 'Other year.',
        sourceSnapshots: {
          context: { kind: 'class', name: 'Other class' },
          lessonPlan: { title: 'Other lesson' },
          sessionOccurrence: { date: '2026-09-20', startMinute: 540, endMinute: 600 },
        },
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    expect((await read.listSchoolYearReflections('year-1')).map((record) => record.id)).toEqual([
      'reflection-newer',
      'reflection-1',
    ]);
    expect(
      (
        await read.listSchoolYearReflections('year-1', {
          status: 'active',
        })
      ).map((record) => record.id),
    ).toEqual(['reflection-1']);
  });

  it('rejects malformed canonical source rows instead of producing partial detail', async () => {
    await database.learnerContexts.put({
      id: 'class-1',
      kind: 'class',
      name: '',
      schoolYearId: 'year-1',
      status: 'active',
    } as never);

    await expect(read.getReflection('reflection-1')).rejects.toThrow();
  });
});
