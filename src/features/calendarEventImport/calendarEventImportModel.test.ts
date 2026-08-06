import { describe, expect, it } from 'vitest';

import {
  calendarEventSchema,
  categoryAssignmentSchema,
  categoryValueSchema,
  schoolYearSchema,
  type CalendarEvent,
} from '@/domain/models/entities';
import { importClassificationReviewKey } from '@/features/importCenter/importClassificationResolution';

import { parseCalendarEventIcs } from './calendarEventImportIcsParser';
import {
  buildCalendarEventIcsIdentity,
  buildCalendarEventImportPreview,
  buildCalendarEventTabularIdentity,
  type BuildCalendarEventImportPreviewInput,
  type CalendarEventImportSource,
} from './calendarEventImportModel';

const generatedAt = '2026-08-05T12:00:00.000Z';
const schoolYear = schoolYearSchema.parse({
  id: 'school-year-2026',
  label: '2026–2027',
  startsOn: '2026-08-24',
  endsOn: '2027-06-18',
  active: true,
  lifecycleState: 'active',
});

const defaultEventType = categoryValueSchema.parse({
  id: 'event-type-calendar',
  familyId: 'calendar-event-type',
  name: 'Calendar',
  normalizedName: 'calendar',
  aliases: [],
  normalizedAliases: [],
  sortOrder: 0,
  isDefault: true,
  lifecycleState: 'active',
  createdAt: generatedAt,
  updatedAt: generatedAt,
});

const professionalDevelopment = categoryValueSchema.parse({
  id: 'event-type-pd',
  familyId: 'calendar-event-type',
  name: 'Professional Development',
  normalizedName: 'professional development',
  aliases: ['PD Day'],
  normalizedAliases: ['pd day'],
  sortOrder: 1,
  isDefault: false,
  lifecycleState: 'active',
  createdAt: generatedAt,
  updatedAt: generatedAt,
});

function calendar(...eventLines: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Classroom Test//EN',
    'BEGIN:VEVENT',
    ...eventLines,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function ids(): () => string {
  let value = 0;
  return () => `generated-${++value}`;
}

async function source(
  ...eventLines: string[]
): Promise<Extract<CalendarEventImportSource, { kind: 'ics' }>> {
  return { kind: 'ics', parsed: await parseCalendarEventIcs(calendar(...eventLines)) };
}

function input(
  sourceValue: CalendarEventImportSource,
  overrides: Partial<BuildCalendarEventImportPreviewInput> = {},
): BuildCalendarEventImportPreviewInput {
  return {
    source: sourceValue,
    schoolYear,
    duplicateDecisions: {},
    tentativeAcknowledgements: {},
    classificationDecisions: {},
    mappingPersistenceDecisions: {},
    existingEvents: [],
    categoryValues: [defaultEventType, professionalDevelopment],
    mappingPresets: [],
    categoryAssignments: [],
    ...overrides,
  };
}

function preview(
  sourceValue: CalendarEventImportSource,
  overrides: Partial<BuildCalendarEventImportPreviewInput> = {},
) {
  return buildCalendarEventImportPreview(input(sourceValue, overrides), {
    createId: ids(),
    now: () => generatedAt,
  });
}

describe('Calendar Event import preview model', () => {
  it('creates one all-day Event, applies the default Event Type, and preserves case-sensitive UID identity', async () => {
    const result = preview(
      await source(
        'UID:District-PD-01',
        'SUMMARY:Professional learning day',
        'DTSTART;VALUE=DATE:20261012',
        'DTEND;VALUE=DATE:20261013',
      ),
    );

    expect(result.canCommit).toBe(true);
    expect(result.summary).toMatchObject({ createCount: 1, updateCount: 0, blockedCount: 0 });
    expect(result.rows[0]).toMatchObject({
      classification: 'create',
      normalized: {
        externalSource: 'ics',
        externalKey: 'District-PD-01',
        importIdentityKey: buildCalendarEventIcsIdentity('District-PD-01'),
        startDate: '2026-10-12',
        endDate: '2026-10-12',
      },
      planned: {
        event: {
          category: 'Calendar',
          schoolYearId: schoolYear.id,
          externalKey: 'District-PD-01',
        },
      },
    });
    expect(result.rows[0]?.planned?.assignmentsToCreate).toEqual([
      expect.objectContaining({
        familyId: 'calendar-event-type',
        categoryValueId: defaultEventType.id,
        entityType: 'calendar-event',
      }),
    ]);
    expect(buildCalendarEventIcsIdentity('District-PD-01')).not.toBe(
      buildCalendarEventIcsIdentity('district-pd-01'),
    );
    expect(buildCalendarEventTabularIdentity(' District Calendar ', 'Event-A')).toBe(
      'calendar-event\u0000tabular\u0000district calendar\u0000Event-A',
    );
  });

  it('updates only an exact identity in the selected School Year and blocks cross-year ownership', async () => {
    const imported = calendarEventSchema.parse({
      id: 'existing-imported',
      title: 'Old title',
      startDate: '2026-10-12',
      endDate: '2026-10-12',
      category: 'Calendar',
      schoolYearId: schoolYear.id,
      externalSource: 'ics',
      externalKey: 'stable-uid',
      importIdentityKey: buildCalendarEventIcsIdentity('stable-uid'),
      lastImportRunId: 'older-run',
    });
    const incoming = await source(
      'UID:stable-uid',
      'SUMMARY:Updated title',
      'DTSTART;VALUE=DATE:20261012',
    );

    const update = preview(incoming, { existingEvents: [imported] });
    expect(update.rows[0]).toMatchObject({
      classification: 'update',
      planned: { existingEvent: { id: imported.id }, event: { title: 'Updated title' } },
    });

    const otherYear = calendarEventSchema.parse({
      ...imported,
      schoolYearId: 'school-year-2025',
    });
    const blocked = preview(incoming, { existingEvents: [otherYear] });
    expect(blocked.rows[0]).toMatchObject({
      classification: 'blocked',
      reasons: ['This stable Calendar Event identity belongs to another School Year.'],
    });
  });

  it('requires an explicit decision before adopting a probable manual duplicate', async () => {
    const manual = calendarEventSchema.parse({
      id: 'manual-event',
      title: 'Family conference',
      startDate: '2026-11-05',
      endDate: '2026-11-05',
      startMinute: 930,
      endMinute: 975,
      category: 'Calendar',
      schoolYearId: schoolYear.id,
    });
    const incoming = await source(
      'UID:conference-uid',
      'SUMMARY:Family conference',
      'DTSTART:20261105T153000',
      'DTEND:20261105T161500',
    );
    const sourceRow = incoming.parsed.rows[0]!.sourceRow;

    const unresolved = preview(incoming, { existingEvents: [manual] });
    expect(unresolved.rows[0]).toMatchObject({
      classification: 'review',
      duplicateReview: {
        candidates: [expect.objectContaining({ id: manual.id, canUpdate: true })],
      },
    });

    const adopted = preview(incoming, {
      existingEvents: [manual],
      duplicateDecisions: { [sourceRow]: { action: 'update', targetId: manual.id } },
    });
    expect(adopted.rows[0]).toMatchObject({
      classification: 'update',
      planned: {
        existingEvent: { id: manual.id },
        event: {
          id: manual.id,
          externalSource: 'ics',
          externalKey: 'conference-uid',
        },
      },
    });

    const skipped = preview(incoming, {
      existingEvents: [manual],
      duplicateDecisions: { [sourceRow]: { action: 'skip' } },
    });
    expect(skipped.rows[0]?.classification).toBe('skip');
  });

  it('keeps TENTATIVE and unknown Event Type values in Review until explicitly resolved', async () => {
    const incoming = await source(
      'UID:tentative-1',
      'SUMMARY:Draft closure',
      'DTSTART;VALUE=DATE:20270115',
      'STATUS:TENTATIVE',
      'CATEGORIES:Special Closure',
    );
    const sourceRow = incoming.parsed.rows[0]!.sourceRow;

    const tentative = preview(incoming);
    expect(tentative.rows[0]).toMatchObject({
      classification: 'review',
      reasons: ['Acknowledge that TENTATIVE will be imported as a normal Calendar Event.'],
    });

    const classificationReview = preview(incoming, {
      tentativeAcknowledgements: { [sourceRow]: true },
    });
    expect(classificationReview.rows[0]?.classification).toBe('review');
    expect(classificationReview.classificationReviews[0]).toMatchObject({
      familyId: 'calendar-event-type',
      displayValue: 'Special Closure',
      genericTagPrefix: undefined,
    });

    const reviewKey = importClassificationReviewKey('calendar-event-type', 'Special Closure');
    const genericFallbackRejected = preview(incoming, {
      tentativeAcknowledgements: { [sourceRow]: true },
      classificationDecisions: { [reviewKey]: { action: 'generic-tag' } },
    });
    expect(genericFallbackRejected.rows[0]?.classification).toBe('review');

    const createdType = preview(incoming, {
      tentativeAcknowledgements: { [sourceRow]: true },
      classificationDecisions: { [reviewKey]: { action: 'create' } },
    });
    expect(createdType.rows[0]?.classification).toBe('create');
    expect(createdType.newCategoryValues).toEqual([
      expect.objectContaining({
        familyId: 'calendar-event-type',
        name: 'Special Closure',
      }),
    ]);
  });

  it('materializes supported recurrence as discrete Events and blocks unsupported recurrence', async () => {
    const recurring = preview(
      await source(
        'UID:repeat-me',
        'SUMMARY:Recurring meeting',
        'DTSTART;VALUE=DATE:20260903',
        'RRULE:FREQ=WEEKLY;COUNT=3;BYDAY=TH',
      ),
    );

    expect(recurring.canCommit).toBe(true);
    expect(recurring.summary).toMatchObject({ createCount: 3, blockedCount: 0 });
    expect(recurring.rows.map((row) => row.normalized?.startDate)).toEqual([
      '2026-09-03',
      '2026-09-10',
      '2026-09-17',
    ]);
    expect(recurring.rows[0]?.planned).toMatchObject({
      series: {
        externalKey: 'repeat-me',
        recurrenceEngineVersion: 'classroom-rfc5545-v1+ical.js-2.2.1',
      },
      occurrence: { managementStatus: 'materialized', sourceStatus: 'active' },
    });

    const blocked = preview(
      await source(
        'UID:blocked-repeat',
        'SUMMARY:Blocked recurring meeting',
        'DTSTART;VALUE=DATE:20260903',
        'RRULE:FREQ=HOURLY;COUNT=2',
      ),
    );
    expect(blocked.canCommit).toBe(false);
    expect(blocked.rows).toHaveLength(1);
    expect(blocked.rows[0]).toMatchObject({ classification: 'blocked' });
    expect(blocked.rows[0]?.reasons.join(' ')).toContain('FREQ=HOURLY');
  });

  it('preserves an existing Calendar Event Type assignment when an exact update omits CATEGORIES', async () => {
    const imported: CalendarEvent = calendarEventSchema.parse({
      id: 'assigned-event',
      title: 'Old PD title',
      startDate: '2026-10-12',
      category: professionalDevelopment.name,
      schoolYearId: schoolYear.id,
      externalSource: 'ics',
      externalKey: 'assigned-uid',
      importIdentityKey: buildCalendarEventIcsIdentity('assigned-uid'),
      lastImportRunId: 'old-run',
    });
    const assignment = categoryAssignmentSchema.parse({
      id: 'assigned-event-type',
      familyId: 'calendar-event-type',
      categoryValueId: professionalDevelopment.id,
      entityType: 'calendar-event',
      entityId: imported.id,
      createdAt: generatedAt,
    });
    const result = preview(
      await source('UID:assigned-uid', 'SUMMARY:Updated PD title', 'DTSTART;VALUE=DATE:20261012'),
      { existingEvents: [imported], categoryAssignments: [assignment] },
    );

    expect(result.rows[0]).toMatchObject({
      classification: 'update',
      planned: {
        event: { category: professionalDevelopment.name },
        expectedAssignments: [{ id: assignment.id }],
        assignmentsToDelete: [],
        assignmentsToCreate: [],
      },
    });
  });

  it('reconciles exact re-import, local edits, manual deletion, and source removal through explicit decisions', async () => {
    const initialSource = await source(
      'UID:managed-series',
      'SUMMARY:Managed weekly event',
      'DTSTART;VALUE=DATE:20260903',
      'RRULE:FREQ=WEEKLY;COUNT=2;BYDAY=TH',
    );
    const first = preview(initialSource);
    const existingEvents = first.rows
      .map((row) => row.planned?.event)
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const existingSeries = first.rows
      .map((row) => row.planned?.series)
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const existingOccurrences = first.rows
      .map((row) => row.planned?.occurrence)
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const categoryAssignments = first.rows.flatMap((row) => row.planned?.assignmentsToCreate ?? []);

    const exact = preview(initialSource, {
      existingEvents,
      existingSeries,
      existingOccurrences,
      categoryAssignments,
    });
    expect(exact.canCommit).toBe(false);
    expect(exact.summary).toMatchObject({ skipCount: 2, createCount: 0, updateCount: 0 });

    const editedEvent = calendarEventSchema.parse({
      ...existingEvents[0]!,
      title: 'Locally edited title',
    });
    const edited = preview(initialSource, {
      existingEvents: [editedEvent, existingEvents[1]!],
      existingSeries,
      existingOccurrences,
      categoryAssignments,
    });
    const editedRow = edited.rows.find((row) => row.planned?.existingEvent?.id === editedEvent.id);
    expect(editedRow).toMatchObject({ classification: 'review' });
    const editedIdentity = editedRow!.rowKey;

    const applySource = preview(initialSource, {
      existingEvents: [editedEvent, existingEvents[1]!],
      existingSeries,
      existingOccurrences,
      categoryAssignments,
      recurrenceDecisions: { [editedIdentity]: { action: 'apply-source' } },
    });
    expect(applySource.rows.find((row) => row.rowKey === editedIdentity)).toMatchObject({
      classification: 'update',
      planned: { event: { title: 'Managed weekly event' } },
    });

    const detach = preview(initialSource, {
      existingEvents: [editedEvent, existingEvents[1]!],
      existingSeries,
      existingOccurrences,
      categoryAssignments,
      recurrenceDecisions: { [editedIdentity]: { action: 'detach' } },
    });
    expect(detach.rows.find((row) => row.rowKey === editedIdentity)).toMatchObject({
      classification: 'update',
      planned: {
        event: { id: editedEvent.id, importIdentityKey: undefined },
        occurrence: { managementStatus: 'detached', relatedManualEventId: editedEvent.id },
      },
    });

    const deletedEvent = existingEvents[1]!;
    const deletedOccurrence = existingOccurrences.find(
      (value) => value.eventId === deletedEvent.id,
    )!;
    const deleted = preview(initialSource, {
      existingEvents: [existingEvents[0]!],
      existingSeries,
      existingOccurrences,
      categoryAssignments,
    });
    expect(
      deleted.rows.find((row) => row.rowKey === deletedOccurrence.occurrenceIdentityKey),
    ).toMatchObject({
      classification: 'review',
    });

    const suppressed = preview(initialSource, {
      existingEvents: [existingEvents[0]!],
      existingSeries,
      existingOccurrences,
      categoryAssignments,
      recurrenceDecisions: {
        [deletedOccurrence.occurrenceIdentityKey]: { action: 'suppress' },
      },
    });
    expect(
      suppressed.rows.find((row) => row.rowKey === deletedOccurrence.occurrenceIdentityKey),
    ).toMatchObject({
      classification: 'update',
      planned: { occurrence: { managementStatus: 'suppressed', eventId: undefined } },
    });

    const shortenedSource = await source(
      'UID:managed-series',
      'SUMMARY:Managed weekly event',
      'DTSTART;VALUE=DATE:20260903',
      'RRULE:FREQ=WEEKLY;COUNT=1;BYDAY=TH',
    );
    const removed = preview(shortenedSource, {
      existingEvents,
      existingSeries,
      existingOccurrences,
      categoryAssignments,
    });
    expect(removed.summary).toMatchObject({ removeCount: 1, updateCount: 1, skipCount: 0 });
    expect(removed.rows.find((row) => row.classification === 'remove')).toMatchObject({
      planned: { eventMutation: 'delete', existingEvent: { id: deletedEvent.id } },
    });
  });

  it('persists a suppression when a reviewed recurring occurrence is skipped as a probable duplicate', async () => {
    const manual = calendarEventSchema.parse({
      id: 'manual-recurring-duplicate',
      title: 'Recurring family meeting',
      startDate: '2026-09-03',
      endDate: '2026-09-03',
      category: 'Calendar',
      schoolYearId: schoolYear.id,
    });
    const recurringSource = await source(
      'UID:duplicate-series',
      'SUMMARY:Recurring family meeting',
      'DTSTART;VALUE=DATE:20260903',
      'RRULE:FREQ=WEEKLY;COUNT=1',
    );
    const unresolved = preview(recurringSource, { existingEvents: [manual] });
    expect(unresolved.rows[0]).toMatchObject({ classification: 'review' });

    const skipped = preview(recurringSource, {
      existingEvents: [manual],
      duplicateDecisions: { [unresolved.rows[0]!.rowKey]: { action: 'skip' } },
    });
    expect(skipped.rows[0]).toMatchObject({
      classification: 'update',
      planned: {
        eventMutation: 'none',
        series: { externalKey: 'duplicate-series' },
        occurrence: { managementStatus: 'suppressed', sourceStatus: 'active' },
      },
    });
  });
});
