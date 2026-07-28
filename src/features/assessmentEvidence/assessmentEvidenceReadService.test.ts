import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';

import { AssessmentEvidenceReadService } from './assessmentEvidenceReadService';

let database: ClassroomDatabase;
let read: AssessmentEvidenceReadService;

const now = '2026-07-28T12:00:00.000Z';

beforeEach(async () => {
  database = new ClassroomDatabase(`assessment-evidence-read-${crypto.randomUUID()}`);
  await database.open();
  read = new AssessmentEvidenceReadService(database);
  await database.assessmentEvidence.bulkPut([
    {
      id: 'evidence-newer',
      studentId: 'student-1',
      schoolYearId: 'year-1',
      occurredOn: '2026-09-10',
      title: 'Newer observation',
      kind: 'observation',
      observation: { text: 'Used the strategy independently.' },
      contextId: 'class-1',
      assessmentId: 'assessment-1',
      standardIds: ['standard-1'],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'evidence-older',
      studentId: 'student-1',
      schoolYearId: 'year-1',
      occurredOn: '2026-09-01',
      title: 'Older score',
      kind: 'score',
      score: { value: 3, maximum: 4 },
      contextId: 'class-1',
      assessmentId: 'assessment-2',
      standardIds: ['standard-1', 'standard-2'],
      status: 'archived',
      archivedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'evidence-other-student',
      studentId: 'student-2',
      schoolYearId: 'year-2',
      occurredOn: '2026-09-12',
      title: 'Other student',
      kind: 'proficiency',
      proficiency: { label: 'Developing', rank: 2, scaleKey: 'reading' },
      contextId: 'group-1',
      assessmentId: 'assessment-1',
      standardIds: ['standard-2'],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ]);
});

afterEach(async () => {
  await database.delete();
});

describe('AssessmentEvidenceReadService', () => {
  it('lists canonical Student evidence newest first with lifecycle and kind filters', async () => {
    expect((await read.listStudentEvidence('student-1')).map((value) => value.id)).toEqual([
      'evidence-newer',
      'evidence-older',
    ]);
    expect(
      (
        await read.listStudentEvidence('student-1', {
          status: 'active',
          kind: 'observation',
        })
      ).map((value) => value.id),
    ).toEqual(['evidence-newer']);
  });

  it('queries context, Standard, and Assessment source indexes without duplicating ownership', async () => {
    expect((await read.listContextEvidence('class-1')).map((value) => value.id)).toEqual([
      'evidence-newer',
      'evidence-older',
    ]);
    expect((await read.listStandardEvidence('standard-2')).map((value) => value.id)).toEqual([
      'evidence-other-student',
      'evidence-older',
    ]);
    expect((await read.listAssessmentEvidence('assessment-1')).map((value) => value.id)).toEqual([
      'evidence-other-student',
      'evidence-newer',
    ]);
  });

  it('returns historical evidence even when optional source records do not exist', async () => {
    const evidence = await read.getEvidence('evidence-newer');
    expect(evidence).toMatchObject({
      studentId: 'student-1',
      contextId: 'class-1',
      assessmentId: 'assessment-1',
    });
  });
});
