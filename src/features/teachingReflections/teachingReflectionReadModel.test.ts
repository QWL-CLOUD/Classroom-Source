import { describe, expect, it } from 'vitest';

import { buildTeachingReflectionDetailReadModel } from './teachingReflectionReadModel';

const now = '2026-09-02T12:00:00.000Z';

function reflection(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    lessonPlanId: 'plan-1',
    contextId: 'class-1',
    date: '2026-09-01',
    startMinute: 540,
    endMinute: 600,
    deliveryState: 'completed',
    completedAt: now,
    reflectionId: 'reflection-1',
    ...overrides,
  };
}

function task(
  id: string,
  status: 'active' | 'waiting' | 'completed' | 'cancelled',
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    title: id,
    status,
    linkedEntityType: 'teaching-reflection',
    linkedEntityId: 'reflection-1',
    order: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Teaching Reflection detail read model', () => {
  it('reports available current sources without replacing the retained snapshots', () => {
    const model = buildTeachingReflectionDetailReadModel({
      reflection: reflection(),
      schoolYear: {
        id: 'year-1',
        label: '2026–2027',
        startsOn: '2026-08-24',
        endsOn: '2027-06-18',
        active: true,
      },
      context: {
        id: 'class-1',
        kind: 'class',
        name: 'Renamed current class',
        schoolYearId: 'year-1',
        status: 'active',
      },
      lessonPlan: {
        id: 'plan-1',
        contextId: 'class-1',
        title: 'Edited current plan title',
        subject: 'Chinese',
        workflowState: 'ready',
        createdAt: now,
        updatedAt: now,
      },
      sessionOccurrence: session(),
    });

    expect(model.source.warnings).toEqual([]);
    expect(model.source.context).toMatchObject({
      state: 'available',
      snapshot: { kind: 'class', name: 'Grade 3 Chinese' },
      current: { name: 'Renamed current class' },
    });
    expect(model.source.lessonPlan.snapshot.title).toBe('Reading workshop');
    expect(model.source.sessionOccurrence).toMatchObject({
      state: 'completed',
      linkState: 'linked',
    });
  });

  it('retains readable snapshots when every current source has been removed', () => {
    const model = buildTeachingReflectionDetailReadModel({ reflection: reflection() });

    expect(model.source).toMatchObject({
      schoolYear: { state: 'unavailable' },
      context: { state: 'unavailable', snapshot: { name: 'Grade 3 Chinese' } },
      lessonPlan: { state: 'unavailable', snapshot: { title: 'Reading workshop' } },
      sessionOccurrence: { state: 'unavailable', linkState: 'unavailable' },
    });
    expect(model.source.warnings).toEqual([
      'school-year-source-unavailable',
      'context-source-unavailable',
      'lesson-plan-source-unavailable',
      'session-source-unavailable',
    ]);
  });

  it('distinguishes reopened, cancelled, missing-pointer, and conflicting-pointer Session states', () => {
    const reopened = buildTeachingReflectionDetailReadModel({
      reflection: reflection(),
      sessionOccurrence: session({
        deliveryState: 'scheduled',
        completedAt: undefined,
        reflectionId: undefined,
      }),
    });
    expect(reopened.source.sessionOccurrence).toMatchObject({
      state: 'reopened',
      linkState: 'missing-pointer',
    });
    expect(reopened.source.warnings).toContain('session-reopened');
    expect(reopened.source.warnings).toContain('session-pointer-missing');

    const cancelled = buildTeachingReflectionDetailReadModel({
      reflection: reflection(),
      sessionOccurrence: session({
        deliveryState: 'cancelled',
        completedAt: undefined,
        reflectionId: 'another-reflection',
      }),
    });
    expect(cancelled.source.sessionOccurrence).toMatchObject({
      state: 'cancelled',
      linkState: 'conflicting-pointer',
    });
    expect(cancelled.source.warnings).toContain('session-cancelled');
    expect(cancelled.source.warnings).toContain('session-pointer-conflict');
  });

  it('summarizes related Evidence and exact linked Tasks without treating either as reflection text', () => {
    const model = buildTeachingReflectionDetailReadModel({
      reflection: reflection(),
      assessmentEvidence: [
        {
          id: 'evidence-observation',
          studentId: 'student-1',
          schoolYearId: 'year-1',
          occurredOn: '2026-09-01',
          title: 'Observation',
          kind: 'observation',
          observation: { text: 'Used the strategy independently.' },
          sessionOccurrenceId: 'session-1',
          standardIds: [],
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'evidence-score',
          studentId: 'student-2',
          schoolYearId: 'year-1',
          occurredOn: '2026-09-01',
          title: 'Score',
          kind: 'score',
          score: { value: 3, maximum: 4 },
          sessionOccurrenceId: 'session-1',
          standardIds: [],
          status: 'archived',
          archivedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'unrelated-evidence',
          studentId: 'student-3',
          schoolYearId: 'year-1',
          occurredOn: '2026-09-01',
          title: 'Other Session',
          kind: 'observation',
          observation: { text: 'Other.' },
          sessionOccurrenceId: 'session-2',
          standardIds: [],
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      ],
      studentRecords: [
        {
          id: 'student-1',
          name: 'Ari Chen',
          preferredName: 'Ari',
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      ],
      tasks: [
        task('active-task', 'active', { scheduledDate: '2026-09-03' }),
        task('waiting-task', 'waiting'),
        task('completed-task', 'completed'),
        task('other-reflection-task', 'active', { linkedEntityId: 'reflection-2' }),
        task('learner-notice-task', 'active', { linkedEntityType: 'learner-notice' }),
      ],
    });

    expect(model.relatedEvidence.records.map((record) => record.id)).toEqual([
      'evidence-observation',
      'evidence-score',
    ]);
    expect(model.relatedEvidence.items).toMatchObject([
      { record: { id: 'evidence-observation' }, student: { name: 'Ari Chen' } },
      { record: { id: 'evidence-score' }, student: undefined },
    ]);
    expect(model.relatedEvidence).toMatchObject({
      activeCount: 1,
      archivedCount: 1,
      countsByKind: { score: 1, proficiency: 0, observation: 1 },
    });
    expect(model.nextSteps.tasks.map((value) => value.id)).toEqual([
      'active-task',
      'waiting-task',
      'completed-task',
    ]);
    expect(model.nextSteps).toMatchObject({
      countsByStatus: { active: 1, waiting: 1, completed: 1, cancelled: 0 },
      openCount: 2,
      closedCount: 1,
    });
  });

  it('rejects malformed canonical related records rather than silently dropping them', () => {
    expect(() =>
      buildTeachingReflectionDetailReadModel({
        reflection: reflection(),
        tasks: [
          {
            id: 'bad-task',
            title: '',
            status: 'active',
            linkedEntityType: 'teaching-reflection',
            linkedEntityId: 'reflection-1',
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
    ).toThrow();
  });
});
