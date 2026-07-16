import { describe, expect, it } from 'vitest';

import {
  createCalendarEventEditorValues,
  minuteToTime,
  parseCalendarEventEditorValues,
  timeToMinute,
  toCalendarEventEditorValues,
} from './calendarEventEditorModel';

describe('calendar event editor validation', () => {
  it('converts a timed form into validated calendar-event fields', () => {
    const fields = parseCalendarEventEditorValues({
      ...createCalendarEventEditorValues('2026-07-20'),
      title: 'Family conference',
      allDay: false,
      startTime: '13:15',
      endTime: '14:00',
      category: 'Meeting',
      details: 'Bring notes.',
    });

    expect(fields).toEqual({
      title: 'Family conference',
      startDate: '2026-07-20',
      endDate: undefined,
      startMinute: 795,
      endMinute: 840,
      category: 'Meeting',
      details: 'Bring notes.',
    });
  });

  it('removes times from all-day records', () => {
    const fields = parseCalendarEventEditorValues({
      ...createCalendarEventEditorValues('2026-07-21'),
      title: 'No school',
      startTime: '09:00',
      endTime: '10:00',
    });

    expect(fields.startMinute).toBeUndefined();
    expect(fields.endMinute).toBeUndefined();
  });

  it('rejects inverted dates and time ranges', () => {
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
    ).toThrow('End time must be after the start time.');
  });

  it('rejects impossible local dates', () => {
    expect(() =>
      parseCalendarEventEditorValues({
        ...createCalendarEventEditorValues('2026-02-31'),
        title: 'Impossible date',
      }),
    ).toThrow('Choose a valid start date.');
  });

  it('round-trips minute and form values without UTC date conversion', () => {
    expect(timeToMinute('13:45')).toBe(825);
    expect(minuteToTime(825)).toBe('13:45');
    expect(
      toCalendarEventEditorValues({
        id: 'event',
        title: 'Workshop',
        startDate: '2026-07-22',
        startMinute: 825,
        endMinute: 900,
        category: 'Professional learning',
      }),
    ).toMatchObject({
      startDate: '2026-07-22',
      startTime: '13:45',
      endTime: '15:00',
      allDay: false,
    });
  });
});
