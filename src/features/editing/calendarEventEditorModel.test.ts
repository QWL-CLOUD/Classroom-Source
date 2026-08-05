import { describe, expect, it } from 'vitest';

import { calendarEventSchema } from '@/domain/models/entities';

import {
  createCalendarEventEditorValues,
  minuteToTime,
  parseCalendarEventEditorValues,
  timeToMinute,
  toCalendarEventEditorValues,
} from './calendarEventEditorModel';

describe('calendar event editor validation', () => {
  it('keeps legacy Events valid and validates import-ready provenance', () => {
    const legacyEvent = calendarEventSchema.parse({
      id: 'legacy-event',
      title: 'Legacy holiday',
      startDate: '2026-12-24',
      category: 'Holiday',
    });
    expect(legacyEvent.schoolYearId).toBeUndefined();
    expect(legacyEvent.importIdentityKey).toBeUndefined();

    expect(
      calendarEventSchema.parse({
        id: 'imported-event',
        title: 'District holiday',
        startDate: '2026-12-24',
        schoolYearId: 'year-1',
        category: 'School Holiday',
        externalSource: 'district calendar',
        externalKey: 'holiday-1',
        importIdentityKey: 'calendar-event\u0000district calendar\u0000holiday-1',
        lastImportRunId: 'run-1',
      }),
    ).toMatchObject({ schoolYearId: 'year-1', lastImportRunId: 'run-1' });

    expect(() =>
      calendarEventSchema.parse({
        id: 'missing-source',
        title: 'Missing source',
        startDate: '2026-12-24',
        category: 'Calendar',
        externalKey: 'event-1',
      }),
    ).toThrow('external event key requires an external source');

    expect(() =>
      calendarEventSchema.parse({
        id: 'missing-identity-parts',
        title: 'Missing identity parts',
        startDate: '2026-12-24',
        category: 'Calendar',
        importIdentityKey: 'calendar-event\u0000missing',
      }),
    ).toThrow('import identity requires both an external source and external key');

    expect(() =>
      calendarEventSchema.parse({
        id: 'missing-year',
        title: 'Missing year',
        startDate: '2026-12-24',
        category: 'Calendar',
        externalSource: 'district calendar',
        externalKey: 'event-2',
        importIdentityKey: 'calendar-event\u0000district calendar\u0000event-2',
        lastImportRunId: 'run-2',
      }),
    ).toThrow('requires a School Year and stable import identity');
  });

  it('converts a timed form into validated calendar-event fields and selections', () => {
    const parsed = parseCalendarEventEditorValues({
      ...createCalendarEventEditorValues('2026-07-20'),
      title: 'Family conference',
      allDay: false,
      startTime: '13:15',
      endTime: '14:00',
      schoolYearId: 'year-1',
      categoryValueId: 'event-type-conference',
      category: 'Meeting',
      details: 'Bring notes.',
      location: 'Room 204',
      timeZone: 'America/New_York',
    });

    expect(parsed).toEqual({
      fields: {
        title: 'Family conference',
        startDate: '2026-07-20',
        endDate: undefined,
        startMinute: 795,
        endMinute: 840,
        schoolYearId: 'year-1',
        category: 'Meeting',
        details: 'Bring notes.',
        location: 'Room 204',
        timeZone: 'America/New_York',
      },
      categoryValueId: 'event-type-conference',
    });
  });

  it('removes times from all-day records', () => {
    const parsed = parseCalendarEventEditorValues({
      ...createCalendarEventEditorValues('2026-07-21'),
      title: 'No school',
      startTime: '09:00',
      endTime: '10:00',
    });

    expect(parsed.fields.startMinute).toBeUndefined();
    expect(parsed.fields.endMinute).toBeUndefined();
  });

  it('accepts an overnight timed event and rejects inverted same-day ranges', () => {
    expect(
      parseCalendarEventEditorValues({
        ...createCalendarEventEditorValues('2026-07-21'),
        title: 'Overnight conference',
        endDate: '2026-07-22',
        allDay: false,
        startTime: '17:00',
        endTime: '09:00',
      }).fields,
    ).toMatchObject({ startMinute: 1020, endMinute: 540 });

    expect(() =>
      parseCalendarEventEditorValues({
        ...createCalendarEventEditorValues('2026-07-21'),
        title: 'Invalid dates',
        endDate: '2026-07-20',
      }),
    ).toThrow('End date cannot be before the start date.');

    expect(() =>
      parseCalendarEventEditorValues({
        ...createCalendarEventEditorValues('2026-07-21'),
        title: 'Invalid time',
        allDay: false,
        startTime: '10:00',
        endTime: '09:00',
      }),
    ).toThrow('End time must be after the start time on the same date.');
  });

  it('rejects impossible local dates', () => {
    expect(() =>
      parseCalendarEventEditorValues({
        ...createCalendarEventEditorValues('2026-02-31'),
        title: 'Impossible date',
      }),
    ).toThrow('Choose a valid start date.');
  });

  it('round-trips School Year, type, location, time zone, and minute values', () => {
    expect(timeToMinute('13:45')).toBe(825);
    expect(minuteToTime(825)).toBe('13:45');
    expect(
      toCalendarEventEditorValues(
        {
          id: 'event',
          title: 'Workshop',
          startDate: '2026-07-22',
          startMinute: 825,
          endMinute: 900,
          schoolYearId: 'year-1',
          category: 'Professional Development',
          location: 'Library',
          timeZone: 'America/New_York',
        },
        'event-type-pd',
      ),
    ).toMatchObject({
      startDate: '2026-07-22',
      startTime: '13:45',
      endTime: '15:00',
      allDay: false,
      schoolYearId: 'year-1',
      categoryValueId: 'event-type-pd',
      location: 'Library',
      timeZone: 'America/New_York',
    });
  });
});
