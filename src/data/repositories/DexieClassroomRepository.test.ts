import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  calendarEventSchema,
  learnerContextSchema,
  quarantineRecordSchema,
  scheduleBlockSchema,
  schoolYearSchema,
} from '@/domain/models/entities';
import { DexieClassroomRepository } from './DexieClassroomRepository';

let databaseSequence = 0;
let database: ClassroomDatabase;
let repository: DexieClassroomRepository;

beforeEach(() => {
  databaseSequence += 1;
  database = new ClassroomDatabase(`classroom-v20-repository-test-${databaseSequence}`);
  repository = new DexieClassroomRepository(database);
});

afterEach(async () => {
  const databaseName = database.name;
  database.close();
  await Dexie.delete(databaseName);
});

describe('DexieClassroomRepository read models', () => {
  it('returns the latest active school year', async () => {
    await database.schoolYears.bulkPut([
      schoolYearSchema.parse({
        id: 'school-year-old',
        label: '2025–2026',
        startsOn: '2025-07-01',
        endsOn: '2026-06-30',
        active: true,
      }),
      schoolYearSchema.parse({
        id: 'school-year-current',
        label: '2026–2027',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        active: true,
      }),
      schoolYearSchema.parse({
        id: 'school-year-inactive',
        label: '2027–2028',
        startsOn: '2027-07-01',
        endsOn: '2028-06-30',
        active: false,
      }),
    ]);

    await expect(repository.getActiveSchoolYear()).resolves.toMatchObject({
      id: 'school-year-current',
      label: '2026–2027',
    });
  });

  it('returns overlapping calendar events in stable order', async () => {
    await database.calendarEvents.bulkPut([
      calendarEventSchema.parse({
        id: 'event-multi-day',
        title: 'Conference',
        startDate: '2026-07-10',
        endDate: '2026-07-14',
      }),
      calendarEventSchema.parse({
        id: 'event-all-day',
        title: 'Assembly',
        startDate: '2026-07-14',
      }),
      calendarEventSchema.parse({
        id: 'event-timed',
        title: 'Family meeting',
        startDate: '2026-07-14',
        startMinute: 540,
        endMinute: 570,
      }),
      calendarEventSchema.parse({
        id: 'event-outside',
        title: 'Outside range',
        startDate: '2026-07-20',
      }),
    ]);

    const events = await repository.listCalendarEventsForRange({
      startDate: '2026-07-13',
      endDate: '2026-07-19',
    });

    expect(events.map((event) => event.id)).toEqual([
      'event-multi-day',
      'event-all-day',
      'event-timed',
    ]);
  });

  it('filters inactive schedule blocks and sorts them deterministically', async () => {
    await database.scheduleBlocks.bulkPut([
      scheduleBlockSchema.parse({
        id: 'block-later',
        title: 'Later block',
        kind: 'teachable',
        weekdays: [1],
        startMinute: 600,
        endMinute: 650,
      }),
      scheduleBlockSchema.parse({
        id: 'block-second',
        title: 'B block',
        kind: 'teachable',
        weekdays: [1],
        startMinute: 480,
        endMinute: 530,
        sortOrder: 2,
      }),
      scheduleBlockSchema.parse({
        id: 'block-first',
        title: 'A block',
        kind: 'teachable',
        weekdays: [1],
        startMinute: 480,
        endMinute: 530,
        sortOrder: 1,
      }),
      scheduleBlockSchema.parse({
        id: 'block-expired',
        title: 'Expired',
        kind: 'teachable',
        weekdays: [1],
        startMinute: 420,
        endMinute: 470,
        effectiveTo: '2026-07-12',
      }),
      scheduleBlockSchema.parse({
        id: 'block-archived',
        title: 'Archived',
        kind: 'teachable',
        weekdays: [1],
        startMinute: 420,
        endMinute: 470,
        archivedAt: '2026-07-01T12:00:00.000Z',
      }),
    ]);

    const blocks = await repository.listScheduleBlocksForRange({
      startDate: '2026-07-13',
      endDate: '2026-07-19',
    });

    expect(blocks.map((block) => block.id)).toEqual(['block-first', 'block-second', 'block-later']);
  });

  it('defaults learner queries to active records and supports kind filters', async () => {
    await database.learnerContexts.bulkPut([
      learnerContextSchema.parse({
        id: 'class-context',
        kind: 'class',
        name: 'Class Alpha',
        schoolYearId: 'school-year-current',
      }),
      learnerContextSchema.parse({
        id: 'group-context',
        kind: 'group',
        name: 'Group Beta',
        schoolYearId: 'school-year-current',
      }),
      learnerContextSchema.parse({
        id: 'archived-context',
        kind: 'individual',
        name: 'Archived learner',
        schoolYearId: 'school-year-current',
        status: 'archived',
      }),
      learnerContextSchema.parse({
        id: 'other-year-context',
        kind: 'class',
        name: 'Other year',
        schoolYearId: 'school-year-old',
      }),
    ]);

    const activeCurrentContexts = await repository.listLearnerContexts({
      schoolYearId: 'school-year-current',
    });
    const groups = await repository.listLearnerContexts({
      schoolYearId: 'school-year-current',
      kind: 'group',
    });

    expect(activeCurrentContexts.map((context) => context.id)).toEqual([
      'class-context',
      'group-context',
    ]);
    expect(groups.map((context) => context.id)).toEqual(['group-context']);
  });

  it('keeps quarantine records outside active calendar queries', async () => {
    await database.calendarEvents.put(
      calendarEventSchema.parse({
        id: 'active-event',
        title: 'Active event',
        startDate: '2026-07-15',
      }),
    );
    await database.quarantineRecords.put(
      quarantineRecordSchema.parse({
        id: 'quarantine-record',
        migrationRunId: 'migration-run',
        entityType: 'calendarEvent',
        legacyStoreKey: 'cos-calendar',
        reason: 'Invalid date',
        rawJson: '{}',
        createdAt: '2026-07-15T12:00:00.000Z',
      }),
    );

    const events = await repository.listCalendarEventsForRange({
      startDate: '2026-07-13',
      endDate: '2026-07-19',
    });

    expect(events.map((event) => event.id)).toEqual(['active-event']);
    await expect(repository.countQuarantineRecords()).resolves.toBe(1);
  });

  it('reports malformed active records instead of silently dropping them', async () => {
    await database.table('calendarEvents').put({
      id: 'malformed-event',
      title: 'Malformed event',
      startDate: 'not-a-local-date',
    });

    await expect(
      repository.listCalendarEventsForRange({
        startDate: '2026-07-13',
        endDate: '2026-07-19',
      }),
    ).rejects.toThrow();
  });

  it('returns a complete workspace summary', async () => {
    await database.schoolYears.put(
      schoolYearSchema.parse({
        id: 'school-year-current',
        label: '2026–2027',
        startsOn: '2026-07-01',
        endsOn: '2027-06-30',
        active: true,
      }),
    );
    await database.learnerContexts.put(
      learnerContextSchema.parse({
        id: 'class-context',
        kind: 'class',
        name: 'Class Alpha',
        schoolYearId: 'school-year-current',
      }),
    );

    const summary = await repository.getWorkspaceDataSummary();

    expect(summary.activeSchoolYear?.id).toBe('school-year-current');
    expect(summary.counts).toMatchObject({
      schoolYears: 1,
      learnerContexts: 1,
      scheduleBlocks: 0,
      calendarEvents: 0,
      quarantine: 0,
    });
  });
});
