import { describe, expect, it } from 'vitest';

import { parseCalendarEventIcs } from './calendarEventImportIcsParser';

function calendar(...lines: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Classroom Test//EN',
    ...lines,
    'END:VCALENDAR',
  ].join('\r\n');
}

describe('Calendar Event ICS parser', () => {
  it('unfolds text and converts exclusive all-day DTEND to an inclusive Classroom end date', () => {
    const parsed = parseCalendarEventIcs(
      calendar(
        'BEGIN:VEVENT',
        'UID:PD-2026-A',
        'SUMMARY:Professional learning day',
        'DESCRIPTION:District learning\\, planning\\; and ',
        ' collaboration',
        'LOCATION:Demo campus',
        'DTSTART;VALUE=DATE:20261012',
        'DTEND;VALUE=DATE:20261014',
        'CATEGORIES:Professional Development',
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        'END:VALARM',
        'END:VEVENT',
      ),
    );

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      externalKey: 'PD-2026-A',
      title: 'Professional learning day',
      details: 'District learning, planning; and collaboration',
      startDate: '2026-10-12',
      endDate: '2026-10-13',
      eventType: 'Professional Development',
      validationErrors: [],
    });
    expect(parsed.diagnostics.map((value) => value.message)).toContain(
      'VALARM was ignored; Calendar import never creates reminders automatically.',
    );
  });

  it('preserves timed wall-time form without converting TZID or UTC values', () => {
    const tzid = parseCalendarEventIcs(
      calendar(
        'BEGIN:VEVENT',
        'UID:conference-1',
        'SUMMARY:Family conference',
        'DTSTART;TZID=America/New_York:20261105T153000',
        'DTEND;TZID=America/New_York:20261105T161500',
        'END:VEVENT',
      ),
    ).rows[0];
    expect(tzid).toMatchObject({
      startDate: '2026-11-05',
      endDate: '2026-11-05',
      startMinute: 15 * 60 + 30,
      endMinute: 16 * 60 + 15,
      timeZone: 'America/New_York',
      validationErrors: [],
      warnings: [
        'TZID America/New_York is retained as wall time; Classroom does not evaluate timezone rules.',
      ],
    });

    const utc = parseCalendarEventIcs(
      calendar(
        'BEGIN:VEVENT',
        'UID:utc-1',
        'SUMMARY:UTC event',
        'DTSTART:20261105T203000Z',
        'DTEND:20261105T211500Z',
        'END:VEVENT',
      ),
    ).rows[0];
    expect(utc).toMatchObject({
      startMinute: 20 * 60 + 30,
      endMinute: 21 * 60 + 15,
      timeZone: 'UTC',
      validationErrors: [],
    });
  });

  it('blocks recurrence, cancellation, lossy seconds, and incompatible time forms per VEVENT', () => {
    const parsed = parseCalendarEventIcs(
      calendar(
        'METHOD:CANCEL',
        'BEGIN:VEVENT',
        'UID:blocked-1',
        'SUMMARY:Recurring event',
        'DTSTART;TZID=America/New_York:20261105T153001',
        'DTEND:20261105T161500Z',
        'RRULE:FREQ=WEEKLY',
        'STATUS:CANCELLED',
        'END:VEVENT',
      ),
    );

    expect(parsed.rows[0]?.validationErrors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('non-zero seconds'),
        expect.stringContaining('same UTC, TZID, or floating-time form'),
        'RRULE is not supported in this phase.',
        'STATUS:CANCELLED is not imported.',
        'METHOD:CANCEL calendars are not imported.',
      ]),
    );
  });

  it('rejects malformed calendar structure and calendars without VEVENT components', () => {
    expect(() => parseCalendarEventIcs('UID:not-a-calendar')).toThrow('BEGIN:VCALENDAR');
    expect(() => parseCalendarEventIcs(calendar('X-WR-CALNAME:Empty'))).toThrow(
      'contains no VEVENT',
    );
  });
});
