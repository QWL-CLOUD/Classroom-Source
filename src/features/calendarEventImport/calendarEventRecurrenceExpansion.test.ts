import { describe, expect, it } from 'vitest';

import { schoolYearSchema } from '@/domain/models/entities';

import { parseCalendarEventIcs } from './calendarEventImportIcsParser';
import {
  expandCalendarEventRecurrence,
  expandCalendarEventRecurrences,
} from './calendarEventRecurrenceExpansion';

const schoolYear = schoolYearSchema.parse({
  id: 'school-year-2026',
  label: '2026–2027',
  startsOn: '2026-08-24',
  endsOn: '2027-06-18',
  active: true,
  lifecycleState: 'active',
});

function calendar(...lines: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Classroom Recurrence Test//EN',
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
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'TZOFFSETFROM:-0400',
  'TZOFFSETTO:-0500',
  'END:STANDARD',
  'END:VTIMEZONE',
];

async function expand(...lines: string[]) {
  const parsed = await parseCalendarEventIcs(calendar(...lines));
  expect(parsed.series).toHaveLength(1);
  return expandCalendarEventRecurrence(parsed.series[0]!, schoolYear);
}

describe('Calendar Event recurrence expansion', () => {
  it('applies RRULE, RDATE, EXDATE, moved override, cancelled override, and all-day duration deterministically', async () => {
    const result = await expand(
      'BEGIN:VEVENT',
      'UID:district-weekly',
      'SUMMARY:District weekly event',
      'DTSTART;VALUE=DATE:20261001',
      'DTEND;VALUE=DATE:20261003',
      'RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=TH',
      'RDATE;VALUE=DATE:20261030',
      'EXDATE;VALUE=DATE:20261015',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:district-weekly',
      'RECURRENCE-ID;VALUE=DATE:20261008',
      'STATUS:CANCELLED',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:district-weekly',
      'RECURRENCE-ID;VALUE=DATE:20261022',
      'SUMMARY:Moved district event',
      'DTSTART;VALUE=DATE:20261023',
      'END:VEVENT',
    );

    expect(result.validationErrors).toEqual([]);
    expect(result.occurrences.map((value) => value.sourceStatus)).toEqual([
      'active',
      'cancelled',
      'excluded',
      'active',
      'active',
    ]);
    expect(result.occurrences.filter((value) => value.row).map((value) => value.row)).toEqual([
      expect.objectContaining({ startDate: '2026-10-01', endDate: '2026-10-02' }),
      expect.objectContaining({
        title: 'Moved district event',
        startDate: '2026-10-23',
        endDate: '2026-10-24',
      }),
      expect.objectContaining({ startDate: '2026-10-30', endDate: '2026-10-31' }),
    ]);
  });

  it('supports DAILY INTERVAL and inclusive UNTIL while counting DTSTART before exclusions', async () => {
    const interval = await expand(
      'BEGIN:VEVENT',
      'UID:daily-interval',
      'SUMMARY:Every other day',
      'DTSTART;VALUE=DATE:20260901',
      'RRULE:FREQ=DAILY;INTERVAL=2;COUNT=4',
      'EXDATE;VALUE=DATE:20260903',
      'END:VEVENT',
    );
    expect(interval.occurrences.map((value) => value.row?.startDate ?? value.sourceStatus)).toEqual(
      ['2026-09-01', 'excluded', '2026-09-05', '2026-09-07'],
    );

    const inclusive = await expand(
      'BEGIN:VEVENT',
      'UID:daily-until',
      'SUMMARY:Inclusive until',
      'DTSTART;VALUE=DATE:20260901',
      'RRULE:FREQ=DAILY;UNTIL=20260905',
      'END:VEVENT',
    );
    expect(inclusive.occurrences.map((value) => value.row?.startDate)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ]);
  });

  it('supports WEEKLY BYDAY/WKST, MONTHLY ordinal and BYSETPOS, and YEARLY BYMONTH/BYMONTHDAY', async () => {
    const weekly = await expand(
      'BEGIN:VEVENT',
      'UID:weekly-multi-day',
      'SUMMARY:Monday Wednesday',
      'DTSTART;VALUE=DATE:20260824',
      'RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO,WE;WKST=SU',
      'END:VEVENT',
    );
    expect(weekly.occurrences.map((value) => value.row?.startDate)).toEqual([
      '2026-08-24',
      '2026-08-26',
      '2026-08-31',
      '2026-09-02',
    ]);

    const ordinal = await expand(
      'BEGIN:VEVENT',
      'UID:first-monday',
      'SUMMARY:First Monday',
      'DTSTART;VALUE=DATE:20260907',
      'RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=1MO',
      'END:VEVENT',
    );
    expect(ordinal.occurrences.map((value) => value.row?.startDate)).toEqual([
      '2026-09-07',
      '2026-10-05',
      '2026-11-02',
    ]);

    const setPosition = await expand(
      'BEGIN:VEVENT',
      'UID:last-weekday',
      'SUMMARY:Last weekday',
      'DTSTART;VALUE=DATE:20260930',
      'RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1',
      'END:VEVENT',
    );
    expect(setPosition.occurrences.map((value) => value.row?.startDate)).toEqual([
      '2026-09-30',
      '2026-10-30',
      '2026-11-30',
    ]);

    const yearly = await expand(
      'BEGIN:VEVENT',
      'UID:annual-opening',
      'SUMMARY:Annual opening',
      'DTSTART;VALUE=DATE:20260907',
      'RRULE:FREQ=YEARLY;COUNT=1;BYMONTH=9;BYMONTHDAY=7',
      'END:VEVENT',
    );
    expect(yearly.occurrences[0]?.row?.startDate).toBe('2026-09-07');
  });

  it('preserves timed multi-day duration and TZID wall time across spring and fall DST transitions', async () => {
    const spring = await expand(
      ...newYorkTimeZone,
      'BEGIN:VEVENT',
      'UID:spring-dst',
      'SUMMARY:Sunday support',
      'DTSTART;TZID=America/New_York:20270228T090000',
      'DTEND;TZID=America/New_York:20270228T103000',
      'RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=SU',
      'END:VEVENT',
    );
    expect(spring.validationErrors).toEqual([]);
    expect(spring.occurrences.map((value) => value.row?.startMinute)).toEqual([540, 540, 540, 540]);
    expect(spring.occurrences.map((value) => value.row?.timeZone)).toEqual([
      'America/New_York',
      'America/New_York',
      'America/New_York',
      'America/New_York',
    ]);

    const multiDay = await expand(
      'BEGIN:VEVENT',
      'UID:timed-multiday',
      'SUMMARY:Overnight institute',
      'DTSTART:20261001T220000Z',
      'DTEND:20261002T013000Z',
      'RRULE:FREQ=WEEKLY;COUNT=2',
      'END:VEVENT',
    );
    expect(multiDay.occurrences.map((value) => value.row)).toEqual([
      expect.objectContaining({ startDate: '2026-10-01', endDate: '2026-10-02', endMinute: 90 }),
      expect.objectContaining({ startDate: '2026-10-08', endDate: '2026-10-09', endMinute: 90 }),
    ]);
  });

  it('blocks unsupported rule parts, invalid combinations, and unsynchronized DTSTART', async () => {
    const cases = [
      'FREQ=HOURLY;COUNT=2',
      'FREQ=DAILY;COUNT=2;UNTIL=20260905',
      'FREQ=WEEKLY;COUNT=2;BYHOUR=9',
      'FREQ=WEEKLY;COUNT=2;BYDAY=1MO',
      'FREQ=MONTHLY;COUNT=2;BYSETPOS=1',
    ];
    for (const rule of cases) {
      const result = await expand(
        'BEGIN:VEVENT',
        `UID:blocked-${rule}`,
        'SUMMARY:Blocked rule',
        'DTSTART;VALUE=DATE:20260901',
        `RRULE:${rule}`,
        'END:VEVENT',
      );
      expect(result.validationErrors.length).toBeGreaterThan(0);
    }

    const unsynchronized = await expand(
      'BEGIN:VEVENT',
      'UID:unsynchronized',
      'SUMMARY:Unsynchronized',
      'DTSTART;VALUE=DATE:20260901',
      'RRULE:FREQ=MONTHLY;COUNT=2;BYDAY=1MO',
      'END:VEVENT',
    );
    expect(unsynchronized.validationErrors).toContain(
      'DTSTART is not synchronized with the RRULE recurrence set.',
    );
  });

  it('handles moved-in, moved-out, and boundary-crossing occurrences without silent clipping', async () => {
    const moved = await expand(
      'BEGIN:VEVENT',
      'UID:boundary-series',
      'SUMMARY:Boundary event',
      'DTSTART;VALUE=DATE:20260820',
      'DTEND;VALUE=DATE:20260821',
      'RRULE:FREQ=DAILY;COUNT=6',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:boundary-series',
      'RECURRENCE-ID;VALUE=DATE:20260820',
      'SUMMARY:Moved into year',
      'DTSTART;VALUE=DATE:20260824',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:boundary-series',
      'RECURRENCE-ID;VALUE=DATE:20260824',
      'SUMMARY:Moved outside year',
      'DTSTART;VALUE=DATE:20260823',
      'END:VEVENT',
    );

    expect(moved.occurrences.some((value) => value.row?.title === 'Moved into year')).toBe(true);
    expect(
      moved.occurrences.some(
        (value) => value.occurrenceKey.includes('2026-08-24') && value.sourceStatus === 'excluded',
      ),
    ).toBe(true);

    const crossing = await expand(
      'BEGIN:VEVENT',
      'UID:cross-boundary',
      'SUMMARY:Cross boundary',
      'DTSTART;VALUE=DATE:20270618',
      'DTEND;VALUE=DATE:20270620',
      'RDATE;VALUE=DATE:20270618',
      'END:VEVENT',
    );
    expect(crossing.occurrences[0]?.validationErrors).toContain(
      'A recurring occurrence crosses the selected School Year boundary.',
    );
  });

  it('applies the aggregate import cap deterministically', async () => {
    const parsed = await parseCalendarEventIcs(
      calendar(
        'BEGIN:VEVENT',
        'UID:small-series-a',
        'SUMMARY:Small A',
        'DTSTART;VALUE=DATE:20260901',
        'RRULE:FREQ=DAILY;COUNT=2',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:small-series-b',
        'SUMMARY:Small B',
        'DTSTART;VALUE=DATE:20260901',
        'RRULE:FREQ=DAILY;COUNT=2',
        'END:VEVENT',
      ),
    );
    const expanded = expandCalendarEventRecurrences(parsed.series, schoolYear);
    expect(expanded).toHaveLength(2);
    expect(
      expanded.flatMap((value) => value.occurrences).map((value) => value.externalKey),
    ).toEqual(['small-series-a', 'small-series-a', 'small-series-b', 'small-series-b']);
  });
});
