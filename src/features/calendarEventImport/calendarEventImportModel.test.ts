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

function source(...eventLines: string[]): Extract<CalendarEventImportSource, { kind: 'ics' }> {
  return { kind: 'ics', parsed: parseCalendarEventIcs(calendar(...eventLines)) };
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
  it('creates one all-day Event, applies the default Event Type, and preserves case-sensitive UID identity', () => {
    const result = preview(
      source(
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

  it('updates only an exact identity in the selected School Year and blocks cross-year ownership', () => {
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
    const incoming = source(
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

  it('requires an explicit decision before adopting a probable manual duplicate', () => {
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
    const incoming = source(
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

  it('keeps TENTATIVE and unknown Event Type values in Review until explicitly resolved', () => {
    const incoming = source(
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

  it('blocks duplicate source identities, dates outside the School Year, and recurring VEVENT data', () => {
    const recurring = source(
      'UID:repeat-me',
      'SUMMARY:Recurring meeting',
      'DTSTART;VALUE=DATE:20260701',
      'RRULE:FREQ=WEEKLY',
    );
    const first = recurring.parsed.rows[0]!;
    const duplicateSource: CalendarEventImportSource = {
      kind: 'ics',
      parsed: {
        ...recurring.parsed,
        rows: [first, { ...first, sourceRow: first.sourceRow + 10, eventOrdinal: 2 }],
      },
    };
    const result = preview(duplicateSource);

    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.classification).toBe('blocked');
      expect(row.reasons).toEqual(
        expect.arrayContaining([
          expect.stringContaining('RRULE'),
          expect.stringContaining('within 2026-08-24 through 2027-06-18'),
          expect.stringContaining('repeats the same Calendar Event identity'),
        ]),
      );
    }
  });

  it('preserves an existing Calendar Event Type assignment when an exact update omits CATEGORIES', () => {
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
      source('UID:assigned-uid', 'SUMMARY:Updated PD title', 'DTSTART;VALUE=DATE:20261012'),
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
});
