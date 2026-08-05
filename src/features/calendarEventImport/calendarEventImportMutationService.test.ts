import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { ClassroomDatabase } from '@/data/db/ClassroomDatabase';
import {
  categoryValueSchema,
  schoolYearSchema,
  type CategoryValue,
  type SchoolYear,
} from '@/domain/models/entities';
import { EditHistoryService } from '@/features/editing/editHistoryService';

import { parseCalendarEventIcs } from './calendarEventImportIcsParser';
import {
  buildCalendarEventImportPreview,
  type CalendarEventImportPreview,
} from './calendarEventImportModel';
import { CalendarEventImportMutationService } from './calendarEventImportMutationService';

const databases: ClassroomDatabase[] = [];
const now = '2026-08-05T12:00:00.000Z';

const schoolYear: SchoolYear = schoolYearSchema.parse({
  id: 'school-year-2026',
  label: '2026–2027',
  startsOn: '2026-08-24',
  endsOn: '2027-06-18',
  active: true,
  lifecycleState: 'active',
});

const defaultEventType: CategoryValue = categoryValueSchema.parse({
  id: 'event-type-calendar',
  familyId: 'calendar-event-type',
  name: 'Calendar',
  normalizedName: 'calendar',
  aliases: [],
  normalizedAliases: [],
  sortOrder: 0,
  isDefault: true,
  lifecycleState: 'active',
  createdAt: now,
  updatedAt: now,
});

function source() {
  return {
    kind: 'ics' as const,
    parsed: parseCalendarEventIcs(
      [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Classroom Test//EN',
        'BEGIN:VEVENT',
        'UID:district-pd-1',
        'SUMMARY:Professional learning day',
        'DTSTART;VALUE=DATE:20261012',
        'DTEND;VALUE=DATE:20261013',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    ),
  };
}

function createIds(prefix: string): () => string {
  let index = 0;
  return () => `${prefix}-${++index}`;
}

function buildPreview(): CalendarEventImportPreview {
  return buildCalendarEventImportPreview(
    {
      source: source(),
      schoolYear,
      duplicateDecisions: {},
      tentativeAcknowledgements: {},
      classificationDecisions: {},
      mappingPersistenceDecisions: {},
      existingEvents: [],
      categoryValues: [defaultEventType],
      mappingPresets: [],
      categoryAssignments: [],
    },
    { createId: createIds('preview'), now: () => now },
  );
}

async function createDatabase(label: string): Promise<ClassroomDatabase> {
  const db = new ClassroomDatabase(`${label}-${crypto.randomUUID()}`);
  databases.push(db);
  await db.open();
  await db.schoolYears.put(schoolYear);
  await db.categoryValues.put(defaultEventType);
  return db;
}

afterEach(async () => {
  await Promise.all(databases.map((db) => db.delete()));
  databases.length = 0;
});

describe('CalendarEventImportMutationService', () => {
  it('commits one atomic Calendar import and globally undoes/redoes without changing adjacent domains', async () => {
    const db = await createDatabase('calendar-event-import');
    const preview = buildPreview();
    const service = new CalendarEventImportMutationService(db, {
      createId: () => 'calendar-import-log',
    });

    const result = await service.commit(preview, {
      sourceKind: 'ics',
      sourceLabel: 'district-calendar.ics',
      sourceContentFingerprint: preview.sourceContentFingerprint,
      confirmUpdates: false,
      confirmCommit: true,
    });

    expect(result.created).toHaveLength(1);
    expect(result.updated).toHaveLength(0);
    expect(result.earliestStartDate).toBe('2026-10-12');
    expect(await db.calendarEvents.count()).toBe(1);
    expect(await db.categoryAssignments.count()).toBe(1);
    expect(await db.importRuns.count()).toBe(1);
    expect(await db.changeLog.count()).toBe(1);
    expect(await db.scheduleBlocks.count()).toBe(0);
    expect(await db.scheduleExceptions.count()).toBe(0);
    expect(await db.sessionOccurrences.count()).toBe(0);
    expect(await db.reminders.count()).toBe(0);

    const run = await db.importRuns.get(preview.importRunId);
    expect(run).toMatchObject({
      importType: 'calendar-events',
      sourceKind: 'ics',
      schoolYearId: schoolYear.id,
      createdCount: 1,
      updatedCount: 0,
    });
    expect(JSON.parse(run?.summaryJson ?? '{}')).toMatchObject({
      sourceFingerprint: preview.sourceContentFingerprint,
      sourceKind: 'ics',
      schoolYear: { id: schoolYear.id },
      outcomes: [expect.objectContaining({ classification: 'create' })],
    });

    const history = new EditHistoryService(db, {
      now: () => '2026-08-05T12:01:00.000Z',
    });
    await history.undo();
    expect(await db.calendarEvents.count()).toBe(0);
    expect(await db.categoryAssignments.count()).toBe(0);
    expect(await db.importRuns.count()).toBe(0);
    expect(await db.schoolYears.get(schoolYear.id)).toEqual(schoolYear);
    expect(await db.categoryValues.get(defaultEventType.id)).toEqual(defaultEventType);

    await history.redo();
    expect(await db.calendarEvents.count()).toBe(1);
    expect(await db.categoryAssignments.count()).toBe(1);
    expect(await db.importRuns.count()).toBe(1);
    expect(await db.scheduleBlocks.count()).toBe(0);
    expect(await db.sessionOccurrences.count()).toBe(0);
    expect(await db.reminders.count()).toBe(0);
  });

  it('rejects stale source and School Year state before writing any import records', async () => {
    const db = await createDatabase('calendar-event-stale');
    const preview = buildPreview();
    const service = new CalendarEventImportMutationService(db);

    await expect(
      service.commit(preview, {
        sourceKind: 'ics',
        sourceContentFingerprint: 'changed-source',
        confirmUpdates: false,
        confirmCommit: true,
      }),
    ).rejects.toThrow('source changed after preview');

    await db.schoolYears.put({ ...schoolYear, label: 'Changed after preview' });
    await expect(
      service.commit(preview, {
        sourceKind: 'ics',
        sourceContentFingerprint: preview.sourceContentFingerprint,
        confirmUpdates: false,
        confirmCommit: true,
      }),
    ).rejects.toThrow('School Year changed after preview');

    expect(await db.calendarEvents.count()).toBe(0);
    expect(await db.categoryAssignments.count()).toBe(0);
    expect(await db.importRuns.count()).toBe(0);
    expect(await db.changeLog.count()).toBe(0);
  });

  it('rolls back the full transaction when command application fails', async () => {
    const db = await createDatabase('calendar-event-failure');
    const preview = buildPreview();
    const service = new CalendarEventImportMutationService(db, {
      applyOperations: async () => {
        throw new Error('forced failure');
      },
    });

    await expect(
      service.commit(preview, {
        sourceKind: 'ics',
        sourceContentFingerprint: preview.sourceContentFingerprint,
        confirmUpdates: false,
        confirmCommit: true,
      }),
    ).rejects.toThrow('forced failure');

    expect(await db.calendarEvents.count()).toBe(0);
    expect(await db.categoryAssignments.count()).toBe(0);
    expect(await db.importRuns.count()).toBe(0);
    expect(await db.changeLog.count()).toBe(0);
    expect(await db.schoolYears.get(schoolYear.id)).toEqual(schoolYear);
  });

  it('requires explicit update confirmation for reviewed updates', async () => {
    const db = await createDatabase('calendar-event-update-confirmation');
    const initialPreview = buildPreview();
    await new CalendarEventImportMutationService(db, { createId: () => 'initial-log' }).commit(
      initialPreview,
      {
        sourceKind: 'ics',
        sourceContentFingerprint: initialPreview.sourceContentFingerprint,
        confirmUpdates: false,
        confirmCommit: true,
      },
    );

    const existingEvents = await db.calendarEvents.toArray();
    const updateSource = {
      kind: 'ics' as const,
      parsed: parseCalendarEventIcs(
        [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'BEGIN:VEVENT',
          'UID:district-pd-1',
          'SUMMARY:Updated professional learning day',
          'DTSTART;VALUE=DATE:20261012',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n'),
      ),
    };
    const updatePreview = buildCalendarEventImportPreview(
      {
        source: updateSource,
        schoolYear,
        duplicateDecisions: {},
        tentativeAcknowledgements: {},
        classificationDecisions: {},
        existingEvents,
        categoryValues: [defaultEventType],
        mappingPresets: [],
        categoryAssignments: await db.categoryAssignments.toArray(),
      },
      { createId: createIds('update'), now: () => '2026-08-05T13:00:00.000Z' },
    );
    expect(updatePreview.summary.updateCount).toBe(1);

    await expect(
      new CalendarEventImportMutationService(db).commit(updatePreview, {
        sourceKind: 'ics',
        sourceContentFingerprint: updatePreview.sourceContentFingerprint,
        confirmUpdates: false,
        confirmCommit: true,
      }),
    ).rejects.toThrow('Confirm the reviewed Calendar Event updates');
  });
});
