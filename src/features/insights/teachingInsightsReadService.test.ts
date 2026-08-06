import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  learnerContextSchema,
  lessonPlanSchema,
  schoolYearSchema,
  sessionOccurrenceSchema,
  studentRecordSchema,
  taskSchema,
  teachingReflectionRecordSchema,
} from '@/domain/models/entities';

import { TeachingInsightsReadService } from './teachingInsightsReadService';

const databaseNames: string[] = [];
let database: ClassroomDatabase;
let service: TeachingInsightsReadService;

const timestamp = '2026-08-05T12:00:00.000Z';

beforeEach(async () => {
  const name = `teaching-insights-${crypto.randomUUID()}`;
  databaseNames.push(name);
  database = new ClassroomDatabase(name);
  await database.open();
  service = new TeachingInsightsReadService(database);
});

afterEach(async () => {
  database.close();
  await Promise.all(databaseNames.splice(0).map((name) => Dexie.delete(name)));
});

async function seedSchoolYear(values: {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  active: boolean;
  lifecycleState?: 'active' | 'archived';
}): Promise<void> {
  await database.schoolYears.put(schoolYearSchema.parse(values));
}

async function seedCompletedSession(values: {
  schoolYearId: string;
  contextId: string;
  planId: string;
  sessionId: string;
  date: string;
}): Promise<void> {
  await database.learnerContexts.put(
    learnerContextSchema.parse({
      id: values.contextId,
      kind: 'class',
      name: values.contextId,
      schoolYearId: values.schoolYearId,
      status: 'active',
    }),
  );
  await database.lessonPlans.put(
    lessonPlanSchema.parse({
      id: values.planId,
      contextId: values.contextId,
      title: values.planId,
      subject: '',
      workflowState: 'ready',
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  await database.sessionOccurrences.put(
    sessionOccurrenceSchema.parse({
      id: values.sessionId,
      lessonPlanId: values.planId,
      contextId: values.contextId,
      date: values.date,
      startMinute: 540,
      endMinute: 600,
      deliveryState: 'completed',
      completedAt: timestamp,
    }),
  );
}

describe('TeachingInsightsReadService', () => {
  it('loads the active School Year and derives a validated read-only Insights view', async () => {
    await seedSchoolYear({
      id: 'current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
      lifecycleState: 'active',
    });
    await seedCompletedSession({
      schoolYearId: 'current',
      contextId: 'class-current',
      planId: 'plan-current',
      sessionId: 'session-current',
      date: '2026-08-03',
    });

    const result = await service.load({ asOfDate: '2026-08-05' });

    expect(result.selectedSchoolYear?.id).toBe('current');
    expect(result.schoolYears.map((schoolYear) => schoolYear.id)).toEqual(['current']);
    expect(result.view?.teachingActivity).toMatchObject({
      completedSessionCount: 1,
      completedTeachingMinutes: 60,
      teachingDayCount: 1,
    });
  });

  it('loads Teaching Reflections and exactly linked Next Step Tasks through the read-only transaction', async () => {
    await seedSchoolYear({
      id: 'current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
      lifecycleState: 'active',
    });
    await seedCompletedSession({
      schoolYearId: 'current',
      contextId: 'class-current',
      planId: 'plan-current',
      sessionId: 'session-current',
      date: '2026-08-03',
    });
    await database.teachingReflections.put(
      teachingReflectionRecordSchema.parse({
        id: 'reflection-current',
        sessionOccurrenceId: 'session-current',
        schoolYearId: 'current',
        contextId: 'class-current',
        lessonPlanId: 'plan-current',
        occurredOn: '2026-08-03',
        whatWorked: 'Students compared strategies.',
        sourceSnapshots: {
          context: { kind: 'class', name: 'class-current' },
          lessonPlan: { title: 'plan-current' },
          sessionOccurrence: { date: '2026-08-03', startMinute: 540, endMinute: 600 },
        },
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    await database.tasks.put(
      taskSchema.parse({
        id: 'task-current',
        title: 'Prepare comparison cards',
        status: 'active',
        contextId: 'class-current',
        linkedEntityType: 'teaching-reflection',
        linkedEntityId: 'reflection-current',
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );

    const result = await service.load({ asOfDate: '2026-08-05' });

    expect(result.view?.contractVersion).toBe(2);
    expect(result.view?.reflectionAndNextSteps).toMatchObject({
      activeReflectionCount: 1,
      reflectedCompletedSessionCount: 1,
      completedSessionWithoutActiveReflectionCount: 0,
      openNextStepCount: 1,
      activeNextStepCount: 1,
      reflectionCoverage: { status: 'available', numerator: 1, denominator: 1, value: 1 },
    });
  });

  it('honors an explicitly requested historical School Year without changing the active year', async () => {
    await seedSchoolYear({
      id: 'current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
      lifecycleState: 'active',
    });
    await seedSchoolYear({
      id: 'historical',
      label: '2025–2026',
      startsOn: '2025-07-01',
      endsOn: '2026-06-30',
      active: false,
      lifecycleState: 'archived',
    });
    await seedCompletedSession({
      schoolYearId: 'current',
      contextId: 'class-current',
      planId: 'plan-current',
      sessionId: 'session-current',
      date: '2026-08-03',
    });
    await seedCompletedSession({
      schoolYearId: 'historical',
      contextId: 'class-historical',
      planId: 'plan-historical',
      sessionId: 'session-historical',
      date: '2026-05-03',
    });

    const result = await service.load({
      schoolYearId: 'historical',
      asOfDate: '2026-08-05',
    });

    expect(result.selectedSchoolYear?.id).toBe('historical');
    expect(result.view?.schoolYear.status).toBe('historical');
    expect(result.view?.teachingActivity.sessions.map((session) => session.id)).toEqual([
      'session-historical',
    ]);
    expect((await database.schoolYears.get('current'))?.active).toBe(true);
  });

  it('falls back to the active School Year when a requested id does not exist', async () => {
    await seedSchoolYear({
      id: 'current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
      lifecycleState: 'active',
    });

    const result = await service.load({
      schoolYearId: 'missing',
      asOfDate: '2026-08-05',
    });

    expect(result.selectedSchoolYear?.id).toBe('current');
  });

  it('returns a stable empty read result when no School Year exists', async () => {
    const result = await service.load({ asOfDate: '2026-08-05' });

    expect(result).toEqual({
      schoolYears: [],
      selectedSchoolYear: null,
      asOfDate: '2026-08-05',
      view: null,
    });
  });

  it('rejects malformed canonical rows instead of silently dropping them', async () => {
    await seedSchoolYear({
      id: 'current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    });
    await database.studentRecords.put({
      id: 'invalid-student',
      name: '',
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    } as never);

    await expect(service.load({ asOfDate: '2026-08-05' })).rejects.toThrow();
  });

  it('performs no writes to canonical, change-log, or settings tables', async () => {
    await seedSchoolYear({
      id: 'current',
      label: '2026–2027',
      startsOn: '2026-07-01',
      endsOn: '2027-06-30',
      active: true,
    });
    await database.studentRecords.put(
      studentRecordSchema.parse({
        id: 'student-1',
        name: 'Learner',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    );
    const before = {
      schoolYears: await database.schoolYears.toArray(),
      students: await database.studentRecords.toArray(),
      changeLogCount: await database.changeLog.count(),
      appSettingsCount: await database.appSettings.count(),
    };

    await service.load({ asOfDate: '2026-08-05' });

    expect(await database.schoolYears.toArray()).toEqual(before.schoolYears);
    expect(await database.studentRecords.toArray()).toEqual(before.students);
    expect(await database.changeLog.count()).toBe(before.changeLogCount);
    expect(await database.appSettings.count()).toBe(before.appSettingsCount);
  });

  it('rejects an invalid as-of date before deriving metrics', async () => {
    await expect(service.load({ asOfDate: '2026-02-30' })).rejects.toThrow(
      'Invalid Insights as-of date: 2026-02-30',
    );
  });
});
