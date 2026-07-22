import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  deriveRolloverStatus,
  SchoolYearReadService,
} from '@/features/schoolYears/schoolYearReadService';

let database: ClassroomDatabase;

beforeEach(async () => {
  database = new ClassroomDatabase(`school-year-read-${crypto.randomUUID()}`);
  await database.open();
});

afterEach(async () => {
  await database.delete();
});

describe('SchoolYearReadService', () => {
  it('returns active, historical, archived, and usage information', async () => {
    await database.schoolYears.bulkPut([
      {
        id: 'current',
        label: '2026–2027',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        active: true,
        lifecycleState: 'active',
      },
      {
        id: 'past',
        label: '2025–2026',
        startsOn: '2025-07-01',
        endsOn: '2026-06-30',
        active: false,
        lifecycleState: 'archived',
      },
    ]);
    await database.learnerContexts.bulkPut([
      {
        id: 'class-1',
        kind: 'class',
        name: 'Class 1',
        schoolYearId: 'current',
        status: 'active',
      },
      {
        id: 'class-2',
        kind: 'class',
        name: 'Class 2',
        schoolYearId: 'past',
        status: 'archived',
      },
    ]);

    const model = await new SchoolYearReadService(database).load('2026-07-21');
    expect(model.activeSchoolYear?.id).toBe('current');
    expect(model.activeSchoolYearCount).toBe(1);
    expect(model.archivedCount).toBe(1);
    expect(model.items).toEqual([
      expect.objectContaining({
        schoolYear: expect.objectContaining({ id: 'current' }),
        learnerContextCount: 1,
      }),
      expect.objectContaining({
        schoolYear: expect.objectContaining({ id: 'past' }),
        learnerContextCount: 1,
      }),
    ]);
  });

  it('derives rollover readiness without automatically changing the active year', () => {
    const schoolYear = {
      id: 'current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
      lifecycleState: 'active' as const,
    };
    expect(deriveRolloverStatus(schoolYear, '2027-05-15').rolloverTone).toBe('upcoming');
    expect(deriveRolloverStatus(schoolYear, '2027-07-01').rolloverTone).toBe('overdue');
    expect(deriveRolloverStatus(null, '2027-07-01').rolloverTone).toBe('missing');
  });
});
