import { describe, expect, it } from 'vitest';

import {
  CALENDAR_EVENT_RECURRENCE_ENGINE_VERSION,
  parseCalendarEventIcs,
} from './calendarEventImportIcsParser';

function calendar(...lines: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Classroom Test//EN',
    ...lines,
    'END:VCALENDAR',
  ].join('\r\n');
}

const newYorkTimeZone = [
  'BEGIN:VTIMEZONE',
  'TZID:America/New_York',
  'BEGIN:DAYLIGHT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'TZOFFSETFROM:-0500',
  'TZOFFSETTO:-0400',
  'TZNAME:EDT',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'TZNAME:EST',
  'END:STANDARD',
  'END:VTIMEZONE',
];

describe('Calendar Event ICS parser', () => {
  it('unfolds text and converts exclusive all-day DTEND to an inclusive Classroom end date', async () => {
    const parsed = await parseCalendarEventIcs(
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
    expect(parsed.series).toHaveLength(0);
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

  it('groups recurring masters and overrides while retaining source timezone definitions', async () => {
    const parsed = await parseCalendarEventIcs(
      calendar(
        ...newYorkTimeZone,
        'BEGIN:VEVENT',
        'UID:weekly-family-night',
        'SUMMARY:Family night',
        'DTSTART;TZID=America/New_York:20261001T183000',
        'DTEND;TZID=America/New_York:20261001T200000',
        'RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=TH',
        'RDATE;TZID=America/New_York:20261030T183000',
        'EXDATE;TZID=America/New_York:20261015T183000',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:weekly-family-night',
        'RECURRENCE-ID;TZID=America/New_York:20261022T183000',
        'SUMMARY:Moved family night',
        'DTSTART;TZID=America/New_York:20261023T183000',
        'DTEND;TZID=America/New_York:20261023T200000',
        'END:VEVENT',
      ),
    );

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.series).toHaveLength(1);
    expect(parsed.series[0]).toMatchObject({
      externalKey: 'weekly-family-night',
      master: {
        recurrenceRules: ['FREQ=WEEKLY;COUNT=4;BYDAY=TH'],
        recurrenceDates: [expect.objectContaining({ date: '2026-10-30' })],
        exclusionDates: [expect.objectContaining({ date: '2026-10-15' })],
      },
      overrides: [
        expect.objectContaining({
          recurrenceId: expect.objectContaining({ date: '2026-10-22' }),
          start: expect.objectContaining({ date: '2026-10-23' }),
        }),
      ],
      validationErrors: [],
    });
    expect(parsed.recurrenceEngineVersion).toBe(CALENDAR_EVENT_RECURRENCE_ENGINE_VERSION);
    expect(parsed.calendarTimeZoneFingerprint).toMatch(/^fnv1a32:/);
    expect(parsed.series[0]?.warnings.join(' ')).toContain('retained as wall time');
  });

  it('blocks unresolved or duplicate VTIMEZONE definitions and unsupported override ranges', async () => {
    const unresolved = await parseCalendarEventIcs(
      calendar(
        'BEGIN:VEVENT',
        'UID:unresolved-zone',
        'SUMMARY:Unresolved zone',
        'DTSTART;TZID=America/New_York:20261105T153000',
        'DTEND;TZID=America/New_York:20261105T161500',
        'RRULE:FREQ=WEEKLY;COUNT=2',
        'END:VEVENT',
      ),
    );
    expect(unresolved.series[0]?.validationErrors).toContain(
      'TZID America/New_York requires a matching VTIMEZONE definition.',
    );

    const ranged = await parseCalendarEventIcs(
      calendar(
        ...newYorkTimeZone,
        'BEGIN:VEVENT',
        'UID:ranged-series',
        'SUMMARY:Ranged series',
        'DTSTART;TZID=America/New_York:20261105T153000',
        'DTEND;TZID=America/New_York:20261105T161500',
        'RRULE:FREQ=WEEKLY;COUNT=2',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:ranged-series',
        'RECURRENCE-ID;RANGE=THISANDFUTURE;TZID=America/New_York:20261112T153000',
        'SUMMARY:Ranged override',
        'DTSTART;TZID=America/New_York:20261112T163000',
        'DTEND;TZID=America/New_York:20261112T171500',
        'END:VEVENT',
      ),
    );
    expect(ranged.series[0]?.validationErrors).toEqual(
      expect.arrayContaining([expect.stringContaining('RANGE=THISANDFUTURE')]),
    );
  });

  it('keeps METHOD:CANCEL, cancelled masters, DURATION-only events, and lossy seconds blocked', async () => {
    const parsed = await parseCalendarEventIcs(
      calendar(
        'METHOD:CANCEL',
        'BEGIN:VEVENT',
        'UID:blocked-1',
        'SUMMARY:Recurring event',
        'DTSTART:20261105T153001Z',
        'DURATION:PT45M',
        'RRULE:FREQ=WEEKLY',
        'STATUS:CANCELLED',
        'END:VEVENT',
      ),
    );

    expect(parsed.series[0]?.validationErrors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('non-zero seconds'),
        expect.stringContaining('DURATION'),
        expect.stringContaining('METHOD:CANCEL'),
        expect.stringContaining('STATUS:CANCELLED'),
      ]),
    );
  });

  it('rejects malformed calendar structure and calendars without VEVENT components', async () => {
    await expect(parseCalendarEventIcs('UID:not-a-calendar')).rejects.toThrow();
    await expect(parseCalendarEventIcs(calendar('X-WR-CALNAME:Empty'))).rejects.toThrow(
      'contains no VEVENT',
    );
  });
});
