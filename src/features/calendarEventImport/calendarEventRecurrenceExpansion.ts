import type { SchoolYear } from '@/domain/models/entities';
import { stableImportFingerprint } from '@/features/importCenter/importPreviewModel';

import type {
  ParsedCalendarEventIcsComponent,
  ParsedCalendarEventIcsDateValue,
  ParsedCalendarEventIcsRow,
  ParsedCalendarEventIcsSeries,
} from './calendarEventImportIcsParser';

export const MAX_RECURRENCE_OCCURRENCES_PER_SERIES = 2_000;
export const MAX_RECURRENCE_OCCURRENCES_PER_IMPORT = 5_000;
export const MAX_RECURRENCE_CANDIDATE_ITERATIONS = 50_000;
export const MAX_RECURRENCE_SPAN_YEARS = 25;

export type ExpandedCalendarEventOccurrenceSourceStatus = 'active' | 'excluded' | 'cancelled';

export interface ExpandedCalendarEventOccurrence {
  sourceRow: number;
  eventOrdinal: number;
  externalKey: string;
  occurrenceKey: string;
  sourceStatus: ExpandedCalendarEventOccurrenceSourceStatus;
  row?: ParsedCalendarEventIcsRow;
  sourceOccurrenceFingerprint?: string;
  warnings: string[];
  validationErrors: string[];
}

export interface ExpandedCalendarEventSeries {
  sourceRow: number;
  eventOrdinal: number;
  externalKey: string;
  masterFingerprint: string;
  calendarTimeZoneFingerprint: string;
  occurrences: ExpandedCalendarEventOccurrence[];
  validationErrors: string[];
  warnings: string[];
}

interface ParsedByDay {
  ordinal?: number;
  weekday: number;
  raw: string;
}

interface ParsedRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count?: number;
  until?: ParsedCalendarEventIcsDateValue;
  byDay: ParsedByDay[];
  byMonthDay: number[];
  byMonth: number[];
  bySetPos: number[];
  weekStart: number;
  errors: string[];
}

const weekdayNumbers: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(value: Date): string {
  return [
    String(value.getUTCFullYear()).padStart(4, '0'),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDate(date);
}

function differenceDays(first: string, second: string): number {
  return Math.round((parseDate(second).getTime() - parseDate(first).getTime()) / 86_400_000);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function occurrenceSortKey(value: ParsedCalendarEventIcsDateValue): string {
  return `${value.date}T${String(value.minute ?? 0).padStart(4, '0')}`;
}

export function calendarEventOccurrenceKey(value: ParsedCalendarEventIcsDateValue): string {
  return `${value.zoneForm}\u0000${value.date}\u0000${value.minute ?? ''}`;
}

function sameDateForm(
  first: ParsedCalendarEventIcsDateValue,
  second: ParsedCalendarEventIcsDateValue,
): boolean {
  return first.kind === second.kind && first.zoneForm === second.zoneForm;
}

function parseUntil(
  raw: string,
  start: ParsedCalendarEventIcsDateValue,
): { value?: ParsedCalendarEventIcsDateValue; error?: string } {
  if (/^\d{8}$/.test(raw)) {
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw)!;
    const date = `${match[1]}-${match[2]}-${match[3]}`;
    return {
      value: { kind: 'date', date, second: 0, zoneForm: 'date', raw },
      error: start.kind === 'date' ? undefined : 'UNTIL must use DATE-TIME for a timed DTSTART.',
    };
  }
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(raw);
  if (!match) return { error: 'UNTIL must use an RFC 5545 DATE or DATE-TIME value.' };
  const utc = match[7] === 'Z';
  const value: ParsedCalendarEventIcsDateValue = {
    kind: 'date-time',
    date: `${match[1]}-${match[2]}-${match[3]}`,
    minute: Number(match[4]) * 60 + Number(match[5]),
    second: Number(match[6]),
    timeZone: utc ? 'UTC' : start.timeZone,
    zoneForm: utc ? 'utc' : start.zoneForm,
    raw,
  };
  if (value.second !== 0) return { value, error: 'UNTIL contains non-zero seconds.' };
  if (start.kind === 'date') return { value, error: 'UNTIL must use DATE for an all-day DTSTART.' };
  if (start.zoneForm === 'utc' && !utc)
    return { value, error: 'A UTC DTSTART requires a UTC UNTIL.' };
  if (start.zoneForm === 'floating' && utc) {
    return { value, error: 'A floating DTSTART requires a floating UNTIL.' };
  }
  if (start.zoneForm.startsWith('tzid:') && !utc) {
    return { value, error: 'A TZID DTSTART requires a UTC UNTIL.' };
  }
  return { value };
}

function parseIntegerList(
  raw: string | undefined,
  label: string,
  min: number,
  max: number,
  disallowZero = false,
): { values: number[]; errors: string[] } {
  if (!raw) return { values: [], errors: [] };
  const values: number[] = [];
  const errors: string[] = [];
  for (const token of raw.split(',')) {
    if (!/^-?\d+$/.test(token)) {
      errors.push(`${label} contains a non-integer value.`);
      continue;
    }
    const value = Number(token);
    if (value < min || value > max || (disallowZero && value === 0)) {
      errors.push(`${label} contains an out-of-range value.`);
      continue;
    }
    values.push(value);
  }
  return { values: [...new Set(values)], errors };
}

function parseRule(raw: string, start: ParsedCalendarEventIcsDateValue): ParsedRule {
  const errors: string[] = [];
  const values = new Map<string, string>();
  for (const part of raw.split(';')) {
    const [rawKey, ...rest] = part.split('=');
    const key = rawKey?.toUpperCase();
    const value = rest.join('=').toUpperCase();
    if (!key || !value) {
      errors.push('RRULE contains an invalid rule part.');
      continue;
    }
    if (values.has(key)) errors.push(`RRULE contains ${key} more than once.`);
    values.set(key, value);
  }
  const frequencyValue = values.get('FREQ');
  const supportedFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as const;
  const frequency = supportedFrequencies.find((value) => value === frequencyValue);
  if (!frequency) errors.push(`FREQ=${frequencyValue ?? '(missing)'} is not supported.`);
  for (const blocked of ['BYSECOND', 'BYMINUTE', 'BYHOUR', 'BYYEARDAY', 'BYWEEKNO']) {
    if (values.has(blocked)) errors.push(`${blocked} is not supported.`);
  }
  const supported = new Set([
    'FREQ',
    'INTERVAL',
    'COUNT',
    'UNTIL',
    'BYDAY',
    'BYMONTHDAY',
    'BYMONTH',
    'BYSETPOS',
    'WKST',
  ]);
  for (const key of values.keys()) {
    if (!supported.has(key)) errors.push(`${key} is not supported.`);
  }

  const intervalRaw = values.get('INTERVAL') ?? '1';
  const interval = /^\d+$/.test(intervalRaw) ? Number(intervalRaw) : 0;
  if (interval < 1) errors.push('INTERVAL must be a positive integer.');
  const countRaw = values.get('COUNT');
  const count = countRaw && /^\d+$/.test(countRaw) ? Number(countRaw) : undefined;
  if (countRaw && (!count || count < 1)) errors.push('COUNT must be a positive integer.');
  const untilRaw = values.get('UNTIL');
  const untilResult = untilRaw ? parseUntil(untilRaw, start) : {};
  if (untilResult.error) errors.push(untilResult.error);
  if (count !== undefined && untilResult.value)
    errors.push('COUNT and UNTIL cannot both be present.');

  const byDay: ParsedByDay[] = [];
  if (values.get('BYDAY')) {
    for (const token of values.get('BYDAY')!.split(',')) {
      const match = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(token);
      if (!match) {
        errors.push('BYDAY contains an invalid weekday value.');
        continue;
      }
      const ordinal = match[1] ? Number(match[1]) : undefined;
      if (ordinal === 0 || (ordinal !== undefined && Math.abs(ordinal) > 53)) {
        errors.push('BYDAY contains an invalid ordinal.');
        continue;
      }
      if (ordinal !== undefined && !['MONTHLY', 'YEARLY'].includes(frequency ?? '')) {
        errors.push('Ordinal BYDAY is supported only with MONTHLY or YEARLY.');
      }
      byDay.push({ ordinal, weekday: weekdayNumbers[match[2]!]!, raw: token });
    }
  }
  const monthDay = parseIntegerList(values.get('BYMONTHDAY'), 'BYMONTHDAY', -31, 31, true);
  const month = parseIntegerList(values.get('BYMONTH'), 'BYMONTH', 1, 12);
  const setPos = parseIntegerList(values.get('BYSETPOS'), 'BYSETPOS', -366, 366, true);
  errors.push(...monthDay.errors, ...month.errors, ...setPos.errors);
  if (setPos.values.length > 0 && byDay.length === 0 && monthDay.values.length === 0) {
    errors.push('BYSETPOS requires BYDAY or BYMONTHDAY in this importer.');
  }
  const weekStartToken = values.get('WKST') ?? 'MO';
  const weekStart = weekdayNumbers[weekStartToken];
  if (weekStart === undefined) errors.push('WKST contains an invalid weekday.');

  return {
    frequency: frequency ?? 'DAILY',
    interval: interval || 1,
    count,
    until: untilResult.value,
    byDay,
    byMonthDay: monthDay.values,
    byMonth: month.values,
    bySetPos: setPos.values,
    weekStart: weekStart ?? 1,
    errors,
  };
}

function dateParts(value: string): { year: number; month: number; day: number; weekday: number } {
  const date = parseDate(value);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  };
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  ordinal: number,
): string | undefined {
  const dates: string[] = [];
  const count = daysInMonth(year, month);
  for (let day = 1; day <= count; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCDay() === weekday) dates.push(formatDate(date));
  }
  return ordinal > 0 ? dates[ordinal - 1] : dates[dates.length + ordinal];
}

function nthWeekdayOfYear(year: number, weekday: number, ordinal: number): string | undefined {
  const dates: string[] = [];
  for (let date = `${year}-01-01`; date.slice(0, 4) === String(year); date = addDays(date, 1)) {
    if (parseDate(date).getUTCDay() === weekday) dates.push(date);
  }
  return ordinal > 0 ? dates[ordinal - 1] : dates[dates.length + ordinal];
}

function applySetPos(values: string[], positions: readonly number[]): string[] {
  if (positions.length === 0) return values;
  const selected: string[] = [];
  for (const position of positions) {
    const value = position > 0 ? values[position - 1] : values[values.length + position];
    if (value) selected.push(value);
  }
  return [...new Set(selected)];
}

function monthlyCandidates(
  year: number,
  month: number,
  rule: ParsedRule,
  startDay: number,
): string[] {
  const count = daysInMonth(year, month);
  let candidates: string[] = [];
  if (rule.byMonthDay.length > 0) {
    for (const value of rule.byMonthDay) {
      const day = value > 0 ? value : count + value + 1;
      if (day >= 1 && day <= count) {
        candidates.push(formatDate(new Date(Date.UTC(year, month - 1, day))));
      }
    }
  } else if (rule.byDay.length > 0) {
    for (const value of rule.byDay) {
      if (value.ordinal !== undefined) {
        const date = nthWeekdayOfMonth(year, month, value.weekday, value.ordinal);
        if (date) candidates.push(date);
      } else {
        for (let day = 1; day <= count; day += 1) {
          const date = new Date(Date.UTC(year, month - 1, day));
          if (date.getUTCDay() === value.weekday) candidates.push(formatDate(date));
        }
      }
    }
  } else if (startDay <= count) {
    candidates.push(formatDate(new Date(Date.UTC(year, month - 1, startDay))));
  }
  candidates = [...new Set(candidates)].sort();
  return applySetPos(candidates, rule.bySetPos);
}

function yearlyCandidates(
  year: number,
  rule: ParsedRule,
  start: ParsedCalendarEventIcsDateValue,
): string[] {
  const startParts = dateParts(start.date);
  const months = rule.byMonth.length > 0 ? rule.byMonth : [startParts.month];
  let candidates: string[] = [];
  if (rule.byDay.some((value) => value.ordinal !== undefined) && rule.byMonth.length === 0) {
    for (const value of rule.byDay) {
      if (value.ordinal !== undefined) {
        const date = nthWeekdayOfYear(year, value.weekday, value.ordinal);
        if (date) candidates.push(date);
      }
    }
  } else {
    for (const month of months) {
      candidates.push(...monthlyCandidates(year, month, rule, startParts.day));
    }
  }
  candidates = [...new Set(candidates)].sort();
  return applySetPos(candidates, rule.bySetPos);
}

function withinUntil(
  value: ParsedCalendarEventIcsDateValue,
  until: ParsedCalendarEventIcsDateValue,
): boolean {
  return occurrenceSortKey(value) <= occurrenceSortKey(until);
}

function generatedDates(
  start: ParsedCalendarEventIcsDateValue,
  rule: ParsedRule,
  endDate: string,
): { dates: string[]; errors: string[] } {
  const errors: string[] = [];
  const dates: string[] = [];
  const startParts = dateParts(start.date);
  let iterations = 0;
  const addCandidate = (date: string): boolean => {
    iterations += 1;
    if (iterations > MAX_RECURRENCE_CANDIDATE_ITERATIONS) {
      errors.push('The recurrence exceeds the safe candidate-iteration limit.');
      return false;
    }
    if (date < start.date) return true;
    const value = { ...start, date };
    if (rule.until && !withinUntil(value, rule.until)) return false;
    dates.push(date);
    return rule.count === undefined || dates.length < rule.count;
  };

  if (rule.frequency === 'DAILY') {
    for (let date = start.date; date <= endDate; date = addDays(date, rule.interval)) {
      const parts = dateParts(date);
      if (rule.byMonth.length > 0 && !rule.byMonth.includes(parts.month)) continue;
      if (rule.byMonthDay.length > 0) {
        const count = daysInMonth(parts.year, parts.month);
        const matching = rule.byMonthDay.some((value) =>
          value > 0 ? value === parts.day : count + value + 1 === parts.day,
        );
        if (!matching) continue;
      }
      if (rule.byDay.length > 0 && !rule.byDay.some((value) => value.weekday === parts.weekday)) {
        continue;
      }
      if (!addCandidate(date)) break;
    }
  } else if (rule.frequency === 'WEEKLY') {
    const startWeekday = parseDate(start.date).getUTCDay();
    const weekOffset = (startWeekday - rule.weekStart + 7) % 7;
    const firstWeekStart = addDays(start.date, -weekOffset);
    const weekdays =
      rule.byDay.length > 0
        ? [...new Set(rule.byDay.map((value) => value.weekday))]
        : [startWeekday];
    outer: for (
      let weekStart = firstWeekStart;
      weekStart <= endDate;
      weekStart = addDays(weekStart, rule.interval * 7)
    ) {
      const candidates = weekdays
        .map((weekday) => addDays(weekStart, (weekday - rule.weekStart + 7) % 7))
        .sort();
      for (const date of candidates) {
        if (date < start.date || date > endDate) continue;
        const parts = dateParts(date);
        if (rule.byMonth.length > 0 && !rule.byMonth.includes(parts.month)) continue;
        if (!addCandidate(date)) break outer;
      }
    }
  } else if (rule.frequency === 'MONTHLY') {
    outer: for (let offset = 0; ; offset += rule.interval) {
      const absolute = startParts.year * 12 + (startParts.month - 1) + offset;
      const year = Math.floor(absolute / 12);
      const month = (absolute % 12) + 1;
      const firstDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
      if (firstDate > endDate) break;
      if (rule.byMonth.length > 0 && !rule.byMonth.includes(month)) continue;
      for (const date of monthlyCandidates(year, month, rule, startParts.day)) {
        if (date < start.date || date > endDate) continue;
        if (!addCandidate(date)) break outer;
      }
    }
  } else {
    outer: for (let year = startParts.year; ; year += rule.interval) {
      const firstDate = `${String(year).padStart(4, '0')}-01-01`;
      if (firstDate > endDate) break;
      for (const date of yearlyCandidates(year, rule, start)) {
        if (date < start.date || date > endDate) continue;
        if (!addCandidate(date)) break outer;
      }
    }
  }

  if (dates[0] !== start.date) {
    errors.push('DTSTART is not synchronized with the RRULE recurrence set.');
  }
  return { dates: [...new Set(dates)], errors };
}

function addMinutes(
  date: string,
  minute: number,
  durationMinutes: number,
): { date: string; minute: number } {
  const total = minute + durationMinutes;
  return {
    date: addDays(date, Math.floor(total / 1_440)),
    minute: ((total % 1_440) + 1_440) % 1_440,
  };
}

function durationFor(component: ParsedCalendarEventIcsComponent): {
  allDay: boolean;
  durationDays: number;
  durationMinutes: number;
  errors: string[];
} {
  const errors: string[] = [];
  const start = component.start;
  const end = component.end;
  if (!start) return { allDay: true, durationDays: 1, durationMinutes: 0, errors };
  if (start.kind === 'date') {
    const durationDays = end ? differenceDays(start.date, end.date) : 1;
    if (durationDays < 1) errors.push('All-day DTEND must be after DTSTART.');
    return { allDay: true, durationDays: Math.max(1, durationDays), durationMinutes: 0, errors };
  }
  const durationMinutes = end
    ? differenceDays(start.date, end.date) * 1_440 + end.minute! - start.minute!
    : 0;
  if (end && durationMinutes <= 0) errors.push('Timed DTEND must be after DTSTART.');
  return { allDay: false, durationDays: 0, durationMinutes: Math.max(0, durationMinutes), errors };
}

function mergedComponent(
  master: ParsedCalendarEventIcsComponent,
  override: ParsedCalendarEventIcsComponent | undefined,
): ParsedCalendarEventIcsComponent {
  if (!override) return master;
  return {
    ...master,
    ...override,
    title: override.title || master.title,
    details: override.presentFields.includes('DESCRIPTION') ? override.details : master.details,
    location: override.presentFields.includes('LOCATION') ? override.location : master.location,
    eventType: override.presentFields.includes('CATEGORIES')
      ? override.eventType
      : master.eventType,
    start: override.start ?? master.start,
    end: override.end ?? master.end,
    warnings: [...new Set([...master.warnings, ...override.warnings])],
    validationErrors: [...new Set([...master.validationErrors, ...override.validationErrors])],
  };
}

function occurrenceRow(
  master: ParsedCalendarEventIcsComponent,
  override: ParsedCalendarEventIcsComponent | undefined,
  start: ParsedCalendarEventIcsDateValue,
): ParsedCalendarEventIcsRow {
  const component = mergedComponent(master, override);
  const actualStart = override?.start ?? start;
  const duration = durationFor(override?.end ? component : master);
  let endDate = actualStart.date;
  let endMinute: number | undefined;
  if (actualStart.kind === 'date') {
    endDate = addDays(actualStart.date, duration.durationDays - 1);
  } else if (component.end || master.end) {
    const end = addMinutes(actualStart.date, actualStart.minute!, duration.durationMinutes);
    endDate = end.date;
    endMinute = end.minute;
  }
  return {
    sourceRow: override?.sourceRow ?? master.sourceRow,
    eventOrdinal: override?.eventOrdinal ?? master.eventOrdinal,
    externalKey: master.externalKey,
    title: component.title,
    details: component.details,
    location: component.location,
    startDate: actualStart.date,
    endDate,
    startMinute: actualStart.minute,
    endMinute,
    timeZone: actualStart.timeZone,
    eventType: component.eventType,
    status: component.status,
    sequence: component.sequence,
    lastModified: component.lastModified,
    presentFields: component.presentFields,
    validationErrors: [...new Set([...component.validationErrors, ...duration.errors])],
    warnings: component.warnings,
  };
}

function validateDateForms(series: ParsedCalendarEventIcsSeries): string[] {
  const master = series.master;
  if (!master?.start) return [];
  const errors: string[] = [];
  for (const value of [...master.recurrenceDates, ...master.exclusionDates]) {
    if (!sameDateForm(master.start, value)) {
      errors.push(
        'RDATE and EXDATE values must match the DTSTART DATE, UTC, TZID, or floating form.',
      );
      break;
    }
  }
  for (const override of series.overrides) {
    if (override.recurrenceId && !sameDateForm(master.start, override.recurrenceId)) {
      errors.push('RECURRENCE-ID values must match the master DTSTART form.');
    }
  }
  return [...new Set(errors)];
}

export function expandCalendarEventRecurrence(
  series: ParsedCalendarEventIcsSeries,
  schoolYear: SchoolYear,
): ExpandedCalendarEventSeries {
  const validationErrors = [...series.validationErrors, ...validateDateForms(series)];
  const warnings = [...series.warnings];
  const master = series.master;
  if (!master?.start) {
    validationErrors.push('A recurring master requires DTSTART.');
    return {
      ...series,
      occurrences: [],
      validationErrors: [...new Set(validationErrors)],
      warnings,
    };
  }
  if (!master.title) validationErrors.push('A recurring master requires SUMMARY.');
  const spanYears = Number(schoolYear.endsOn.slice(0, 4)) - Number(master.start.date.slice(0, 4));
  if (spanYears > MAX_RECURRENCE_SPAN_YEARS) {
    validationErrors.push(
      `The recurrence starts more than ${MAX_RECURRENCE_SPAN_YEARS} years before the selected School Year ends.`,
    );
  }

  const recurrenceDates = new Map<string, ParsedCalendarEventIcsDateValue>();
  if (master.recurrenceRules.length === 0) {
    recurrenceDates.set(calendarEventOccurrenceKey(master.start), master.start);
  } else {
    const rule = parseRule(master.recurrenceRules[0]!, master.start);
    validationErrors.push(...rule.errors);
    if (rule.errors.length === 0) {
      const generated = generatedDates(master.start, rule, schoolYear.endsOn);
      validationErrors.push(...generated.errors);
      for (const date of generated.dates) {
        const value = { ...master.start, date, raw: date };
        recurrenceDates.set(calendarEventOccurrenceKey(value), value);
      }
    }
  }
  for (const value of master.recurrenceDates) {
    recurrenceDates.set(calendarEventOccurrenceKey(value), value);
  }
  const exclusions = new Set(master.exclusionDates.map(calendarEventOccurrenceKey));
  const overrides = new Map<string, ParsedCalendarEventIcsComponent>();
  for (const override of series.overrides) {
    if (override.recurrenceId) {
      overrides.set(calendarEventOccurrenceKey(override.recurrenceId), override);
    }
  }

  const allKeys = new Set([...recurrenceDates.keys(), ...overrides.keys(), ...exclusions]);
  const occurrences: ExpandedCalendarEventOccurrence[] = [];
  for (const key of allKeys) {
    const baseStart = recurrenceDates.get(key) ?? overrides.get(key)?.recurrenceId;
    if (!baseStart) continue;
    const override = overrides.get(key);
    const status =
      override?.status === 'CANCELLED' ? 'cancelled' : exclusions.has(key) ? 'excluded' : 'active';
    const row = status === 'active' ? occurrenceRow(master, override, baseStart) : undefined;
    const movedOutside =
      row && (row.startDate < schoolYear.startsOn || row.endDate! > schoolYear.endsOn);
    const recurrenceInside =
      baseStart.date >= schoolYear.startsOn && baseStart.date <= schoolYear.endsOn;
    const movedInside =
      row && row.startDate >= schoolYear.startsOn && row.endDate! <= schoolYear.endsOn;
    if (!recurrenceInside && !movedInside) continue;
    const effectiveStatus = movedOutside ? 'excluded' : status;
    const occurrenceErrors = [...(row?.validationErrors ?? [])];
    if (row && row.startDate >= schoolYear.startsOn && row.endDate! > schoolYear.endsOn) {
      occurrenceErrors.push('A recurring occurrence crosses the selected School Year boundary.');
    }
    occurrences.push({
      sourceRow: override?.sourceRow ?? master.sourceRow,
      eventOrdinal: override?.eventOrdinal ?? master.eventOrdinal,
      externalKey: master.externalKey,
      occurrenceKey: key,
      sourceStatus: effectiveStatus,
      row: effectiveStatus === 'active' ? row : undefined,
      sourceOccurrenceFingerprint:
        effectiveStatus === 'active' && row
          ? stableImportFingerprint({
              row: { ...row, sourceRow: 0, eventOrdinal: 0 },
              recurrenceEngineVersion: 'classroom-rfc5545-v1+ical.js-2.2.1',
            })
          : undefined,
      warnings: movedOutside
        ? [
            ...new Set([
              ...warnings,
              'The moved occurrence falls outside the selected School Year.',
            ]),
          ]
        : warnings,
      validationErrors: [...new Set(occurrenceErrors)],
    });
  }

  occurrences.sort((first, second) => {
    const firstParts = first.occurrenceKey.split('\u0000');
    const secondParts = second.occurrenceKey.split('\u0000');
    const firstDate = firstParts[1] ?? first.row?.startDate ?? '';
    const secondDate = secondParts[1] ?? second.row?.startDate ?? '';
    const firstMinute = firstParts[2] ?? '';
    const secondMinute = secondParts[2] ?? '';
    return (
      firstDate.localeCompare(secondDate) ||
      firstMinute.localeCompare(secondMinute) ||
      first.occurrenceKey.localeCompare(second.occurrenceKey)
    );
  });
  if (occurrences.length > MAX_RECURRENCE_OCCURRENCES_PER_SERIES) {
    validationErrors.push(
      `The series expands to more than ${MAX_RECURRENCE_OCCURRENCES_PER_SERIES.toLocaleString('en-US')} occurrences.`,
    );
  }

  return {
    sourceRow: series.sourceRow,
    eventOrdinal: series.eventOrdinal,
    externalKey: series.externalKey,
    masterFingerprint: series.masterFingerprint,
    calendarTimeZoneFingerprint: series.calendarTimeZoneFingerprint,
    occurrences,
    validationErrors: [...new Set(validationErrors)],
    warnings: [...new Set(warnings)],
  };
}

export function expandCalendarEventRecurrences(
  series: readonly ParsedCalendarEventIcsSeries[],
  schoolYear: SchoolYear,
): ExpandedCalendarEventSeries[] {
  const expanded = series.map((value) => expandCalendarEventRecurrence(value, schoolYear));
  const total = expanded.reduce((sum, value) => sum + value.occurrences.length, 0);
  if (total > MAX_RECURRENCE_OCCURRENCES_PER_IMPORT) {
    return expanded.map((value) => ({
      ...value,
      validationErrors: [
        ...value.validationErrors,
        `The ICS source expands to more than ${MAX_RECURRENCE_OCCURRENCES_PER_IMPORT.toLocaleString('en-US')} occurrences. Split the source into smaller imports.`,
      ],
    }));
  }
  return expanded;
}
