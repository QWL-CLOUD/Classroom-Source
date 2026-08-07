import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';

import { LearnerProgressReadService } from './learnerProgressReadService';

let database: ClassroomDatabase;
let read: LearnerProgressReadService;
const now = '2026-08-07T12:00:00.000Z';

beforeEach(async () => {
  database = new ClassroomDatabase(`learner-progress-read-${crypto.randomUUID()}`);
  await database.open();
  read = new LearnerProgressReadService(database);

  await database.schoolYears.bulkPut([
    {
      id: 'year-current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
      lifecycleState: 'active',
    },
    {
      id: 'year-history',
      label: '2025–2026',
      startsOn: '2025-07-01',
      endsOn: '2026-06-30',
      active: false,
      lifecycleState: 'archived',
      archivedAt: now,
    },
  ]);
  await database.studentRecords.put({
    id: 'student-1',
    name: 'Alice Chen',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  await database.learnerContexts.put({
    id: 'class-1',
    kind: 'class',
    name: 'Class A',
    schoolYearId: 'year-current',
    status: 'active',
  });
  await database.standards.put({
    id: 'standard-1',
    issuingOrganization: 'Synthetic',
    frameworkTitle: 'Synthetic Framework',
    frameworkKey: 'synthetic',
    code: 'S.1',
    normalizedCode: 's.1',
    statement: 'Use evidence from a source.',
    sortOrder: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
  await database.assessmentEvidence.put({
    id: 'evidence-1',
    studentId: 'student-1',
    schoolYearId: 'year-current',
    occurredOn: '2026-08-04',
    title: 'Observation',
    kind: 'observation',
    observation: { text: 'Explained reasoning independently.' },
    contextId: 'class-1',
    standardIds: ['standard-1'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });
});

afterEach(async () => {
  await database.delete();
});

describe('LearnerProgressReadService', () => {
  it('loads the active School Year with canonical Evidence sources and no derived persistence', async () => {
    const result = await read.load({ asOfDate: '2026-08-07' });

    expect(result.selectedSchoolYear?.id).toBe('year-current');
    expect(result.snapshot?.evidence.map((record) => record.id)).toEqual(['evidence-1']);
    expect(result.snapshot?.students.map((student) => student.id)).toEqual(['student-1']);
    expect(result.snapshot?.contexts.map((context) => context.id)).toEqual(['class-1']);
    expect(result.snapshot?.standards.map((standard) => standard.id)).toEqual(['standard-1']);
    expect(await database.changeLog.count()).toBe(0);
  });

  it('honors an explicitly requested historical School Year without changing the active year', async () => {
    const result = await read.load({ schoolYearId: 'year-history', asOfDate: '2026-08-07' });
    expect(result.selectedSchoolYear?.id).toBe('year-history');
    expect((await database.schoolYears.toArray()).find((schoolYear) => schoolYear.active)?.id).toBe(
      'year-current',
    );
  });

  it('returns a stable empty snapshot state when no School Year exists', async () => {
    await database.schoolYears.clear();
    const result = await read.load({ asOfDate: '2026-08-07' });
    expect(result).toMatchObject({
      schoolYears: [],
      selectedSchoolYear: null,
      asOfDate: '2026-08-07',
      snapshot: null,
    });
  });

  it('rejects an invalid as-of date before reading learner progress', async () => {
    await expect(read.load({ asOfDate: 'not-a-date' })).rejects.toThrow(
      'Invalid Learner Progress as-of date',
    );
  });
});
