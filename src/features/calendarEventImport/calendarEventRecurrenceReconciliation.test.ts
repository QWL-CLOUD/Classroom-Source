import { describe, expect, it } from 'vitest';

import {
  calendarEventImportOccurrenceSchema,
  calendarEventImportSeriesSchema,
  calendarEventSchema,
  schoolYearSchema,
} from '@/domain/models/entities';

import type { ExpandedCalendarEventSeries } from './calendarEventRecurrenceExpansion';
import {
  buildCalendarEventOccurrenceIdentity,
  buildCalendarEventSeriesIdentity,
  calendarEventManagedFingerprint,
  reconcileCalendarEventRecurrence,
} from './calendarEventRecurrenceReconciliation';

const generatedAt = '2026-08-05T12:00:00.000Z';
const schoolYear = schoolYearSchema.parse({
  id: 'school-year-2026',
  label: '2026–2027',
  startsOn: '2026-08-24',
  endsOn: '2027-06-18',
  active: true,
  lifecycleState: 'active',
});

function expanded(
  overrides: Partial<ExpandedCalendarEventSeries> = {},
): ExpandedCalendarEventSeries {
  return {
    sourceRow: 4,
    eventOrdinal: 1,
    externalKey: 'weekly@example.test',
    masterFingerprint: 'fnv1a32:master001',
    calendarTimeZoneFingerprint: 'fnv1a32:timezone1',
    occurrences: [
      {
        sourceRow: 4,
        eventOrdinal: 1,
        externalKey: 'weekly@example.test',
        occurrenceKey: 'date\u00002026-10-01\u0000',
        sourceStatus: 'active',
        row: {
          sourceRow: 4,
          eventOrdinal: 1,
          externalKey: 'weekly@example.test',
          title: 'Weekly planning',
          startDate: '2026-10-01',
          endDate: '2026-10-01',
          presentFields: ['UID', 'SUMMARY', 'DTSTART', 'RRULE'],
          validationErrors: [],
          warnings: [],
        },
        sourceOccurrenceFingerprint: 'fnv1a32:source001',
        warnings: [],
        validationErrors: [],
      },
    ],
    validationErrors: [],
    warnings: [],
    ...overrides,
  };
}

function ownedRecords() {
  const seriesIdentityKey = buildCalendarEventSeriesIdentity(schoolYear.id, 'weekly@example.test');
  const occurrenceIdentityKey = buildCalendarEventOccurrenceIdentity(
    seriesIdentityKey,
    'date\u00002026-10-01\u0000',
  );
  const event = calendarEventSchema.parse({
    id: 'event-1',
    title: 'Weekly planning',
    startDate: '2026-10-01',
    endDate: '2026-10-01',
    category: 'Calendar',
    schoolYearId: schoolYear.id,
    externalSource: 'ics',
    externalKey: 'weekly@example.test',
    importIdentityKey: `calendar-event\u0000ics-recurrence\u0000${occurrenceIdentityKey}`,
    lastImportRunId: 'run-1',
  });
  const series = calendarEventImportSeriesSchema.parse({
    id: 'series-1',
    schoolYearId: schoolYear.id,
    externalSource: 'ics',
    externalKey: 'weekly@example.test',
    seriesIdentityKey,
    masterFingerprint: 'fnv1a32:master001',
    calendarTimeZoneFingerprint: 'fnv1a32:timezone1',
    recurrenceEngineVersion: 'classroom-rfc5545-v1+ical.js-2.2.1',
    lastImportRunId: 'run-1',
    createdAt: generatedAt,
    updatedAt: generatedAt,
  });
  const occurrence = calendarEventImportOccurrenceSchema.parse({
    id: 'occurrence-1',
    seriesId: series.id,
    schoolYearId: schoolYear.id,
    occurrenceKey: 'date\u00002026-10-01\u0000',
    occurrenceIdentityKey,
    sourceStatus: 'active',
    managementStatus: 'materialized',
    eventId: event.id,
    sourceOccurrenceFingerprint: 'fnv1a32:source001',
    lastImportedEventFingerprint: calendarEventManagedFingerprint(event),
    lastImportRunId: 'run-1',
    createdAt: generatedAt,
    updatedAt: generatedAt,
  });
  return { series, occurrence, event, seriesIdentityKey, occurrenceIdentityKey };
}

function reconcile(
  source: ExpandedCalendarEventSeries,
  overrides: Partial<Parameters<typeof reconcileCalendarEventRecurrence>[0]> = {},
) {
  return reconcileCalendarEventRecurrence({
    expanded: source,
    schoolYear,
    existingSeries: [],
    existingOccurrences: [],
    existingEvents: [],
    decisions: {},
    ...overrides,
  });
}

describe('Calendar Event recurrence reconciliation', () => {
  it('classifies first import, exact re-import, source update, and blocked expansion', () => {
    expect(reconcile(expanded())[0]).toMatchObject({
      classification: 'create',
      managementAction: 'materialize',
    });

    const owned = ownedRecords();
    expect(
      reconcile(expanded(), {
        existingSeries: [owned.series],
        existingOccurrences: [owned.occurrence],
        existingEvents: [owned.event],
      })[0],
    ).toMatchObject({ classification: 'skip', locallyEdited: false, sourceChanged: false });

    const changed = expanded({
      occurrences: [
        {
          ...expanded().occurrences[0]!,
          sourceOccurrenceFingerprint: 'fnv1a32:source002',
          row: { ...expanded().occurrences[0]!.row!, title: 'Updated weekly planning' },
        },
      ],
    });
    expect(
      reconcile(changed, {
        existingSeries: [owned.series],
        existingOccurrences: [owned.occurrence],
        existingEvents: [owned.event],
      })[0],
    ).toMatchObject({ classification: 'update', managementAction: 'update-materialized' });

    expect(reconcile(expanded({ validationErrors: ['Unsupported recurrence.'] }))[0]).toMatchObject(
      {
        classification: 'blocked',
      },
    );
  });

  it('requires an explicit apply-source or detach decision for a locally edited Event', () => {
    const owned = ownedRecords();
    const edited = calendarEventSchema.parse({ ...owned.event, title: 'Teacher-edited title' });
    const unresolved = reconcile(expanded(), {
      existingSeries: [owned.series],
      existingOccurrences: [owned.occurrence],
      existingEvents: [edited],
    });
    expect(unresolved[0]).toMatchObject({ classification: 'review', locallyEdited: true });

    expect(
      reconcile(expanded(), {
        existingSeries: [owned.series],
        existingOccurrences: [owned.occurrence],
        existingEvents: [edited],
        decisions: { [owned.occurrenceIdentityKey]: { action: 'apply-source' } },
      })[0],
    ).toMatchObject({ classification: 'update', managementAction: 'update-materialized' });

    expect(
      reconcile(expanded(), {
        existingSeries: [owned.series],
        existingOccurrences: [owned.occurrence],
        existingEvents: [edited],
        decisions: { [owned.occurrenceIdentityKey]: { action: 'detach' } },
      })[0],
    ).toMatchObject({ classification: 'update', managementAction: 'detach' });
  });

  it('requires recreate or suppress after manual deletion and preserves suppression on later imports', () => {
    const owned = ownedRecords();
    const unresolved = reconcile(expanded(), {
      existingSeries: [owned.series],
      existingOccurrences: [owned.occurrence],
      existingEvents: [],
    });
    expect(unresolved[0]).toMatchObject({ classification: 'review' });

    expect(
      reconcile(expanded(), {
        existingSeries: [owned.series],
        existingOccurrences: [owned.occurrence],
        existingEvents: [],
        decisions: { [owned.occurrenceIdentityKey]: { action: 'recreate' } },
      })[0],
    ).toMatchObject({ classification: 'create', managementAction: 'materialize' });

    expect(
      reconcile(expanded(), {
        existingSeries: [owned.series],
        existingOccurrences: [owned.occurrence],
        existingEvents: [],
        decisions: { [owned.occurrenceIdentityKey]: { action: 'suppress' } },
      })[0],
    ).toMatchObject({ classification: 'update', managementAction: 'suppress' });

    const suppressed = calendarEventImportOccurrenceSchema.parse({
      ...owned.occurrence,
      managementStatus: 'suppressed',
      eventId: undefined,
      lastImportedEventFingerprint: undefined,
    });
    expect(
      reconcile(expanded(), {
        existingSeries: [owned.series],
        existingOccurrences: [suppressed],
        existingEvents: [],
      })[0],
    ).toMatchObject({ classification: 'skip', managementAction: 'metadata-only' });

    const changed = expanded({
      occurrences: [
        {
          ...expanded().occurrences[0]!,
          sourceOccurrenceFingerprint: 'fnv1a32:source002',
          row: { ...expanded().occurrences[0]!.row!, title: 'Changed suppressed occurrence' },
        },
      ],
    });
    expect(
      reconcile(changed, {
        existingSeries: [owned.series],
        existingOccurrences: [suppressed],
        existingEvents: [],
      })[0],
    ).toMatchObject({ classification: 'review', sourceChanged: true });
    expect(
      reconcile(changed, {
        existingSeries: [owned.series],
        existingOccurrences: [suppressed],
        existingEvents: [],
        decisions: { [owned.occurrenceIdentityKey]: { action: 'recreate' } },
      })[0],
    ).toMatchObject({ classification: 'create', managementAction: 'materialize' });
    expect(
      reconcile(changed, {
        existingSeries: [owned.series],
        existingOccurrences: [suppressed],
        existingEvents: [],
        decisions: { [owned.occurrenceIdentityKey]: { action: 'suppress' } },
      })[0],
    ).toMatchObject({ classification: 'update', managementAction: 'suppress' });
  });

  it('removes an unedited source-absent occurrence and reviews a locally edited one', () => {
    const owned = ownedRecords();
    const absent = expanded({ occurrences: [] });
    expect(
      reconcile(absent, {
        existingSeries: [owned.series],
        existingOccurrences: [owned.occurrence],
        existingEvents: [owned.event],
      })[0],
    ).toMatchObject({
      classification: 'remove',
      sourceStatus: 'absent',
      managementAction: 'remove-materialized',
    });

    const edited = calendarEventSchema.parse({ ...owned.event, details: 'Local notes' });
    expect(
      reconcile(absent, {
        existingSeries: [owned.series],
        existingOccurrences: [owned.occurrence],
        existingEvents: [edited],
      })[0],
    ).toMatchObject({ classification: 'review', locallyEdited: true });

    expect(
      reconcile(absent, {
        existingSeries: [owned.series],
        existingOccurrences: [owned.occurrence],
        existingEvents: [edited],
        decisions: { [owned.occurrenceIdentityKey]: { action: 'detach' } },
      })[0],
    ).toMatchObject({ classification: 'update', managementAction: 'detach' });
  });

  it('persists excluded and cancelled tombstones without creating Events', () => {
    const baseOccurrence = expanded().occurrences[0]!;
    for (const sourceStatus of ['excluded', 'cancelled'] as const) {
      const source = expanded({
        occurrences: [
          {
            ...baseOccurrence,
            sourceStatus,
            row: undefined,
            sourceOccurrenceFingerprint: undefined,
          },
        ],
      });
      expect(reconcile(source)[0]).toMatchObject({
        classification: 'update',
        sourceStatus,
        managementAction: 'metadata-only',
      });
    }
  });

  it('limits reconciliation authority to the UID and School Year in the supplied series', () => {
    const owned = ownedRecords();
    const otherSeries = calendarEventImportSeriesSchema.parse({
      ...owned.series,
      id: 'series-other',
      externalKey: 'other@example.test',
      seriesIdentityKey: buildCalendarEventSeriesIdentity(schoolYear.id, 'other@example.test'),
    });
    const otherOccurrence = calendarEventImportOccurrenceSchema.parse({
      ...owned.occurrence,
      id: 'occurrence-other',
      seriesId: otherSeries.id,
      occurrenceIdentityKey: buildCalendarEventOccurrenceIdentity(
        otherSeries.seriesIdentityKey,
        owned.occurrence.occurrenceKey,
      ),
    });

    const rows = reconcile(expanded(), {
      existingSeries: [owned.series, otherSeries],
      existingOccurrences: [owned.occurrence, otherOccurrence],
      existingEvents: [owned.event],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.seriesIdentityKey).toBe(owned.seriesIdentityKey);
    expect(buildCalendarEventSeriesIdentity('school-year-2027', 'weekly@example.test')).not.toBe(
      owned.seriesIdentityKey,
    );
  });
});
