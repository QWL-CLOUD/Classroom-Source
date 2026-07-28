import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { AssessmentEvidenceMutationService } from './assessmentEvidenceMutationService';

let database: ClassroomDatabase;
let mutation: AssessmentEvidenceMutationService;
let history: EditHistoryService;
let ids: string[];

const now = '2026-07-28T12:00:00.000Z';

beforeEach(async () => {
  database = new ClassroomDatabase(`assessment-evidence-${crypto.randomUUID()}`);
  await database.open();
  ids = [];
  mutation = new AssessmentEvidenceMutationService(database, {
    createId: () => ids.shift() ?? crypto.randomUUID(),
    now: () => now,
  });
  history = new EditHistoryService(database, {
    now: () => '2026-07-28T13:00:00.000Z',
  });

  await database.schoolYears.put({
    id: 'year-1',
    label: '2026–2027',
    startsOn: '2026-08-24',
    endsOn: '2027-06-18',
    active: true,
    lifecycleState: 'active',
  });
  await database.studentRecords.put({
    id: 'student-1',
    name: 'Synthetic Student',
    status: 'active',
    createdAt: now,
    updatedAt: now,
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
  });
  await database.libraryItems.put({
    id: 'assessment-1',
    catalogType: 'assessment',
    title: 'Reading conference rubric',
    tags: [],
    typedFields: {
      catalogType: 'assessment',
      assessmentKind: 'formative',
    },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  await database.standards.put({
    id: 'standard-1',
    issuingOrganization: 'Synthetic organization',
    frameworkTitle: 'Synthetic framework',
    frameworkKey: 'synthetic|framework',
    code: 'RL.3.1',
    normalizedCode: 'rl.3.1',
    statement: 'Ask and answer questions about a text.',
    sortOrder: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
});

afterEach(async () => {
  await database.delete();
});

function scoreValues() {
  return {
    studentId: 'student-1',
    schoolYearId: 'year-1',
    occurredOn: '2026-09-01',
    title: 'Reading conference',
    kind: 'score' as const,
    score: { value: 8, maximum: 10 },
    contextId: 'class-1',
    lessonPlanId: 'plan-1',
    sessionOccurrenceId: 'session-1',
    assessmentId: 'assessment-1',
    standardIds: ['standard-1', 'standard-1'],
    notes: 'Initial evidence.',
  };
}

describe('Assessment Evidence domain and persistence', () => {
  it('creates source-traceable evidence transactionally and participates in global Undo/Redo', async () => {
    ids = ['evidence-1', 'log-create'];

    const created = await mutation.create(scoreValues());

    expect(created).toMatchObject({
      id: 'evidence-1',
      studentId: 'student-1',
      kind: 'score',
      standardIds: ['standard-1'],
      sourceSnapshots: {
        context: { kind: 'class', name: 'Grade 3 Chinese' },
        lessonPlan: { title: 'Reading workshop' },
        sessionOccurrence: { date: '2026-09-01', startMinute: 540, endMinute: 600 },
        assessment: { title: 'Reading conference rubric', assessmentKind: 'formative' },
        standards: [
          {
            standardId: 'standard-1',
            code: 'RL.3.1',
            statement: 'Ask and answer questions about a text.',
          },
        ],
      },
    });

    await history.undo();
    expect(await database.assessmentEvidence.get('evidence-1')).toBeUndefined();

    await history.redo();
    expect(await database.assessmentEvidence.get('evidence-1')).toBeDefined();
  });

  it('updates evidence type without deriving grades and restores the previous record through Undo', async () => {
    ids = ['evidence-1', 'log-create'];
    await mutation.create(scoreValues());
    ids = ['log-update'];

    const updated = await mutation.update('evidence-1', {
      ...scoreValues(),
      title: 'Reading conference observation',
      kind: 'observation',
      observation: { text: 'Used text evidence independently.' },
    });

    expect(updated.kind).toBe('observation');
    expect(updated).not.toHaveProperty('score');
    expect(updated).not.toHaveProperty('finalGrade');

    await history.undo();
    expect(await database.assessmentEvidence.get('evidence-1')).toMatchObject({
      kind: 'score',
      score: { value: 8, maximum: 10 },
    });
  });

  it('preserves evidence and snapshots when optional source records are later deleted', async () => {
    ids = ['evidence-1', 'log-create'];
    await mutation.create(scoreValues());
    await database.learnerContexts.delete('class-1');
    await database.lessonPlans.delete('plan-1');
    await database.sessionOccurrences.delete('session-1');
    await database.libraryItems.delete('assessment-1');
    await database.standards.delete('standard-1');
    ids = ['log-update'];

    const updated = await mutation.update('evidence-1', {
      ...scoreValues(),
      notes: 'Edited after source cleanup.',
    });

    expect(updated).toMatchObject({
      contextId: 'class-1',
      lessonPlanId: 'plan-1',
      sessionOccurrenceId: 'session-1',
      assessmentId: 'assessment-1',
      standardIds: ['standard-1'],
      sourceSnapshots: {
        context: { name: 'Grade 3 Chinese' },
        lessonPlan: { title: 'Reading workshop' },
        assessment: { title: 'Reading conference rubric' },
      },
    });
  });

  it('archives and restores evidence without changing ownership or source links', async () => {
    ids = ['evidence-1', 'log-create'];
    await mutation.create(scoreValues());
    ids = ['log-archive'];

    const archived = await mutation.archive('evidence-1');
    expect(archived).toMatchObject({
      status: 'archived',
      studentId: 'student-1',
      contextId: 'class-1',
    });

    ids = ['log-restore'];
    const restored = await mutation.restore('evidence-1');
    expect(restored.status).toBe('active');
    expect(restored.archivedAt).toBeUndefined();
  });

  it('rolls back the evidence write when the change log cannot commit', async () => {
    ids = ['evidence-failed', 'log-failed'];
    database.changeLog.hook('creating', () => {
      throw new Error('Synthetic journal failure');
    });

    await expect(mutation.create(scoreValues())).rejects.toThrow(/Synthetic journal failure/);

    expect(await database.assessmentEvidence.get('evidence-failed')).toBeUndefined();
    expect(await database.changeLog.count()).toBe(0);
  });
});
