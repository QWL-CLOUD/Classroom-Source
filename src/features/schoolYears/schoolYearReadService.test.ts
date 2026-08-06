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

    await database.calendarEvents.bulkPut([
      {
        id: 'event-current',
        title: 'Current holiday',
        startDate: '2026-12-24',
        schoolYearId: 'current',
        category: 'School Holiday',
      },
      {
        id: 'event-past',
        title: 'Past holiday',
        startDate: '2025-12-24',
        schoolYearId: 'past',
        category: 'School Holiday',
      },
      {
        id: 'event-legacy',
        title: 'Legacy event',
        startDate: '2026-01-10',
        category: 'Calendar',
      },
    ]);

    await database.assessmentEvidence.put({
      id: 'evidence-past',
      studentId: 'student-1',
      schoolYearId: 'past',
      occurredOn: '2026-05-01',
      title: 'Historical evidence',
      kind: 'observation',
      observation: { text: 'Preserve.' },
      standardIds: [],
      status: 'active',
      createdAt: '2026-05-01T12:00:00.000Z',
      updatedAt: '2026-05-01T12:00:00.000Z',
    });
    await database.teachingReflections.put({
      id: 'reflection-past',
      sessionOccurrenceId: 'session-past',
      schoolYearId: 'past',
      contextId: 'class-2',
      lessonPlanId: 'plan-past',
      occurredOn: '2026-05-02',
      whatWorked: 'Students used the visual routine independently.',
      sourceSnapshots: {
        context: { kind: 'class', name: 'Class 2' },
        lessonPlan: { title: 'Historical lesson' },
        sessionOccurrence: {
          date: '2026-05-02',
          startMinute: 540,
          endMinute: 600,
        },
      },
      status: 'active',
      createdAt: '2026-05-02T12:00:00.000Z',
      updatedAt: '2026-05-02T12:00:00.000Z',
    });
    await database.calendarEventImportSeries.put({
      id: 'series-past',
      schoolYearId: 'past',
      externalSource: 'ics',
      externalKey: 'series@example.test',
      seriesIdentityKey: 'series-past-key',
      masterFingerprint: 'fnv1a32:11111111',
      calendarTimeZoneFingerprint: 'fnv1a32:22222222',
      recurrenceEngineVersion: 'classroom-rfc5545-v1+ical.js-2.2.1',
      lastImportRunId: 'run-past',
      createdAt: '2026-07-21T16:00:00.000Z',
      updatedAt: '2026-07-21T16:00:00.000Z',
    });
    await database.calendarEventImportOccurrences.put({
      id: 'occurrence-past',
      seriesId: 'series-past',
      schoolYearId: 'past',
      occurrenceKey: 'date\u00002026-05-01\u0000',
      occurrenceIdentityKey: 'occurrence-past-key',
      sourceStatus: 'excluded',
      managementStatus: 'suppressed',
      lastImportRunId: 'run-past',
      createdAt: '2026-07-21T16:00:00.000Z',
      updatedAt: '2026-07-21T16:00:00.000Z',
    });

    const model = await new SchoolYearReadService(database).load('2026-07-21');
    expect(model.activeSchoolYear?.id).toBe('current');
    expect(model.activeSchoolYearCount).toBe(1);
    expect(model.archivedCount).toBe(1);
    expect(model.items).toEqual([
      expect.objectContaining({
        schoolYear: expect.objectContaining({ id: 'current' }),
        learnerContextCount: 1,
        assessmentEvidenceCount: 0,
        teachingReflectionCount: 0,
        calendarEventCount: 1,
        recurrenceSeriesCount: 0,
        recurrenceOccurrenceCount: 0,
      }),
      expect.objectContaining({
        schoolYear: expect.objectContaining({ id: 'past' }),
        learnerContextCount: 1,
        assessmentEvidenceCount: 1,
        teachingReflectionCount: 1,
        calendarEventCount: 1,
        recurrenceSeriesCount: 1,
        recurrenceOccurrenceCount: 1,
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
