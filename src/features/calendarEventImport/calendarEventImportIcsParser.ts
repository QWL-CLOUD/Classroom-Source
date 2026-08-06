import { stableImportFingerprint } from '@/features/importCenter/importPreviewModel';

export const MAX_CALENDAR_EVENT_ICS_ROWS = 5_000;
export const CALENDAR_EVENT_RECURRENCE_ENGINE_VERSION = 'classroom-rfc5545-v1+ical.js-2.2.1';

export type CalendarEventIcsDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface CalendarEventIcsDiagnostic {
  severity: CalendarEventIcsDiagnosticSeverity;
  message: string;
  sourceRow?: number;
  eventOrdinal?: number;
}

export interface ParsedCalendarEventIcsDateValue {
  kind: 'date' | 'date-time';
  date: string;
  minute?: number;
  second: number;
  timeZone?: string;
  zoneForm: 'date' | 'utc' | 'floating' | `tzid:${string}`;
  raw: string;
}

export interface ParsedCalendarEventIcsRow {
  sourceRow: number;
  eventOrdinal: number;
  externalKey: string;
  title: string;
  details?: string;
  location?: string;
  startDate: string;
  endDate?: string;
  startMinute?: number;
  endMinute?: number;
  timeZone?: string;
  eventType?: string;
  status?: string;
  sequence?: string;
  lastModified?: string;
  presentFields: string[];
  validationErrors: string[];
  warnings: string[];
}

export interface ParsedCalendarEventIcsComponent {
  sourceRow: number;
  eventOrdinal: number;
  externalKey: string;
  title: string;
  details?: string;
  location?: string;
  eventType?: string;
  status?: string;
  sequence?: string;
  lastModified?: string;
  start?: ParsedCalendarEventIcsDateValue;
  end?: ParsedCalendarEventIcsDateValue;
  recurrenceId?: ParsedCalendarEventIcsDateValue;
  recurrenceRange?: string;
  recurrenceRules: string[];
  recurrenceDates: ParsedCalendarEventIcsDateValue[];
  exclusionDates: ParsedCalendarEventIcsDateValue[];
  presentFields: string[];
  validationErrors: string[];
  warnings: string[];
  componentFingerprint: string;
}

export interface ParsedCalendarEventIcsSeries {
  sourceRow: number;
  eventOrdinal: number;
  externalKey: string;
  master?: ParsedCalendarEventIcsComponent;
  overrides: ParsedCalendarEventIcsComponent[];
  validationErrors: string[];
  warnings: string[];
  masterFingerprint: string;
  calendarTimeZoneFingerprint: string;
}

export interface ParsedCalendarEventIcs {
  rows: ParsedCalendarEventIcsRow[];
  series: ParsedCalendarEventIcsSeries[];
  diagnostics: CalendarEventIcsDiagnostic[];
  sourceFingerprint: string;
  calendarTimeZoneFingerprint: string;
  recurrenceEngineVersion: typeof CALENDAR_EVENT_RECURRENCE_ENGINE_VERSION;
  componentCount: number;
}

interface ContentLine {
  name: string;
  params: Map<string, string>;
  value: string;
  sourceRow: number;
}

interface ParsedTimeZone {
  tzid: string;
  lines: ContentLine[];
  sourceRow: number;
  validationErrors: string[];
}

function splitOutsideQuotes(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      current += character;
      escaped = true;
      continue;
    }
    if (character === '"') quoted = !quoted;
    if (!quoted && character === separator) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts;
}

function contentValueSeparator(line: string): number {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') quoted = !quoted;
    if (character === ':' && !quoted) return index;
  }
  return -1;
}

function parseContentLine(line: string, sourceRow: number): ContentLine {
  const separator = contentValueSeparator(line);
  if (separator < 1) throw new Error(`Line ${sourceRow} is not a valid iCalendar content line.`);
  const head = line.slice(0, separator);
  const value = line.slice(separator + 1);
  const [rawName, ...rawParameters] = splitOutsideQuotes(head, ';');
  const name = rawName?.trim().toUpperCase();
  if (!name) throw new Error(`Line ${sourceRow} has no property name.`);
  const params = new Map<string, string>();
  for (const rawParameter of rawParameters) {
    const equals = rawParameter.indexOf('=');
    if (equals < 1) throw new Error(`Line ${sourceRow} contains an invalid property parameter.`);
    const key = rawParameter.slice(0, equals).trim().toUpperCase();
    let parameterValue = rawParameter.slice(equals + 1).trim();
    if (parameterValue.startsWith('"') && parameterValue.endsWith('"')) {
      parameterValue = parameterValue.slice(1, -1);
    }
    params.set(key, parameterValue);
  }
  return { name, params, value, sourceRow };
}

function unfoldLines(text: string): Array<{ value: string; sourceRow: number }> {
  const physical = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const unfolded: Array<{ value: string; sourceRow: number }> = [];
  for (let index = 0; index < physical.length; index += 1) {
    const line = physical[index] ?? '';
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1]!.value += line.slice(1);
      continue;
    }
    unfolded.push({ value: line, sourceRow: index + 1 });
  }
  return unfolded.filter((line) => line.value.length > 0);
}

function unescapeText(value: string): string {
  return value
    .replace(/\\[nN]/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .normalize('NFKC')
    .trim();
}

function splitEscapedComma(value: string): string[] {
  const values: string[] = [];
  let current = '';
  let escaped = false;
  for (const character of value) {
    if (escaped) {
      current += `\\${character}`;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === ',') {
      values.push(unescapeText(current));
      current = '';
    } else {
      current += character;
    }
  }
  if (escaped) current += '\\';
  values.push(unescapeText(current));
  return values.filter(Boolean);
}

function localDate(year: string, month: string, day: string): string | undefined {
  const value = `${year}-${month}-${day}`;
  const date = new Date(`${value}T00:00:00Z`);
  return date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
    ? value
    : undefined;
}

function previousDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  date.setUTCDate(date.getUTCDate() - 1);
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function parseDateValue(line: ContentLine): {
  value?: ParsedCalendarEventIcsDateValue;
  error?: string;
} {
  const explicitValue = line.params.get('VALUE')?.toUpperCase();
  const isDate = explicitValue === 'DATE' || (!explicitValue && /^\d{8}$/.test(line.value));
  if (explicitValue && !['DATE', 'DATE-TIME'].includes(explicitValue)) {
    return { error: `${line.name} uses unsupported VALUE=${explicitValue}.` };
  }
  if (isDate) {
    const match = /^(\d{4})(\d{2})(\d{2})$/.exec(line.value);
    if (!match) return { error: `${line.name} must use YYYYMMDD for an all-day value.` };
    const date = localDate(match[1]!, match[2]!, match[3]!);
    if (!date) return { error: `${line.name} contains an invalid calendar date.` };
    if (line.params.has('TZID')) return { error: `${line.name} DATE values cannot include TZID.` };
    return {
      value: { kind: 'date', date, second: 0, zoneForm: 'date', raw: line.value },
    };
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(line.value);
  if (!match) {
    return { error: `${line.name} must use YYYYMMDDTHHMMSS, optionally ending in Z.` };
  }
  const date = localDate(match[1]!, match[2]!, match[3]!);
  if (!date) return { error: `${line.name} contains an invalid calendar date.` };
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) {
    return { error: `${line.name} contains an invalid time.` };
  }
  const utc = match[7] === 'Z';
  const tzid = line.params.get('TZID')?.trim();
  if (utc && tzid) return { error: `${line.name} cannot combine UTC Z notation with TZID.` };
  const timeZone = utc ? 'UTC' : tzid || undefined;
  const zoneForm: ParsedCalendarEventIcsDateValue['zoneForm'] = utc
    ? 'utc'
    : tzid
      ? `tzid:${tzid}`
      : 'floating';
  return {
    value: {
      kind: 'date-time',
      date,
      minute: hour * 60 + minute,
      second,
      timeZone,
      zoneForm,
      raw: line.value,
    },
    error:
      second === 0
        ? undefined
        : `${line.name} contains non-zero seconds, which cannot be stored without truncation.`,
  };
}

function parseDateList(line: ContentLine): {
  values: ParsedCalendarEventIcsDateValue[];
  errors: string[];
} {
  if (line.value.includes('/')) {
    return { values: [], errors: [`${line.name} PERIOD values are not supported.`] };
  }
  const values: ParsedCalendarEventIcsDateValue[] = [];
  const errors: string[] = [];
  for (const rawValue of splitOutsideQuotes(line.value, ',')) {
    const parsed = parseDateValue({ ...line, value: rawValue.trim() });
    if (parsed.value) values.push(parsed.value);
    if (parsed.error) errors.push(parsed.error);
  }
  return { values, errors };
}

function one(lines: readonly ContentLine[], name: string): ContentLine | undefined {
  return lines.find((line) => line.name === name);
}

function all(lines: readonly ContentLine[], name: string): ContentLine[] {
  return lines.filter((line) => line.name === name);
}

const supportedEventProperties = new Set([
  'UID',
  'SUMMARY',
  'DTSTART',
  'DTEND',
  'DESCRIPTION',
  'LOCATION',
  'CATEGORIES',
  'STATUS',
  'SEQUENCE',
  'LAST-MODIFIED',
  'DTSTAMP',
  'CREATED',
  'TRANSP',
  'CLASS',
  'URL',
  'ORGANIZER',
  'ATTENDEE',
  'PRIORITY',
  'RRULE',
  'RDATE',
  'EXDATE',
  'RECURRENCE-ID',
]);

function parseEventComponent(
  lines: readonly ContentLine[],
  eventOrdinal: number,
  calendarMethod: string | undefined,
): ParsedCalendarEventIcsComponent {
  const firstRow = lines[0]?.sourceRow ?? eventOrdinal;
  const errors: string[] = [];
  const warnings: string[] = [];
  const uid = unescapeText(one(lines, 'UID')?.value ?? '');
  const title = unescapeText(one(lines, 'SUMMARY')?.value ?? '');
  if (!uid) errors.push('UID is required.');
  if (uid.length > 500) errors.push('UID exceeds 500 characters.');
  if (/\p{Cc}/u.test(uid)) errors.push('UID contains control characters.');

  const starts = all(lines, 'DTSTART');
  const ends = all(lines, 'DTEND');
  const recurrenceIds = all(lines, 'RECURRENCE-ID');
  if (starts.length > 1) errors.push('At most one DTSTART is supported.');
  if (ends.length > 1) errors.push('At most one DTEND is supported.');
  if (recurrenceIds.length > 1) errors.push('At most one RECURRENCE-ID is supported.');
  const startResult = starts[0] ? parseDateValue(starts[0]) : {};
  const endResult = ends[0] ? parseDateValue(ends[0]) : {};
  const recurrenceResult = recurrenceIds[0] ? parseDateValue(recurrenceIds[0]) : {};
  if (startResult.error) errors.push(startResult.error);
  if (endResult.error) errors.push(endResult.error);
  if (recurrenceResult.error) errors.push(recurrenceResult.error);
  const start = startResult.value;
  const end = endResult.value;
  const recurrenceId = recurrenceResult.value;
  if (!recurrenceId && starts.length !== 1) errors.push('Exactly one DTSTART is required.');
  if (start && end && start.kind !== end.kind) {
    errors.push('DTSTART and DTEND must both be all-day values or both be timed values.');
  }
  if (start && end && start.zoneForm !== end.zoneForm) {
    errors.push('DTSTART and DTEND must use the same UTC, TZID, or floating-time form.');
  }
  if (recurrenceId && start && recurrenceId.zoneForm !== start.zoneForm) {
    errors.push(
      'RECURRENCE-ID and DTSTART must use the same DATE, UTC, TZID, or floating-time form.',
    );
  }

  if (all(lines, 'DURATION').length > 0) {
    errors.push('DURATION is not supported; provide an explicit DTEND.');
  }
  const recurrenceRange = recurrenceIds[0]?.params.get('RANGE')?.toUpperCase();
  if (recurrenceRange) {
    errors.push(`RECURRENCE-ID RANGE=${recurrenceRange} is not supported.`);
  }
  if (calendarMethod?.toUpperCase() === 'CANCEL') {
    errors.push('METHOD:CANCEL calendars are not imported.');
  }

  const status = unescapeText(one(lines, 'STATUS')?.value ?? '').toUpperCase() || undefined;
  if (status === 'TENTATIVE') {
    warnings.push('TENTATIVE status requires explicit acknowledgement.');
  } else if (status && !['CONFIRMED', 'CANCELLED'].includes(status)) {
    warnings.push(`STATUS:${status} is retained only in the import audit.`);
  }

  const categoryValues = all(lines, 'CATEGORIES').flatMap((line) => splitEscapedComma(line.value));
  const uniqueCategories = [
    ...new Map(
      categoryValues.map((value) => [value.toLocaleLowerCase('en-US'), value] as const),
    ).values(),
  ];
  if (uniqueCategories.length > 1) {
    errors.push('CATEGORIES contains more than one Calendar Event Type.');
  }

  const details = unescapeText(one(lines, 'DESCRIPTION')?.value ?? '') || undefined;
  const location = unescapeText(one(lines, 'LOCATION')?.value ?? '') || undefined;
  if (title.length > 500) errors.push('SUMMARY exceeds 500 characters.');
  if (details && details.length > 10_000) errors.push('DESCRIPTION exceeds 10,000 characters.');
  if (location && location.length > 1_000) errors.push('LOCATION exceeds 1,000 characters.');
  if (start?.timeZone && start.timeZone.length > 200) errors.push('TZID exceeds 200 characters.');
  if (start?.zoneForm.startsWith('tzid:') && start.timeZone) {
    warnings.push(
      `TZID ${start.timeZone} is retained as wall time; the source VTIMEZONE is validated without converting the Event to another zone.`,
    );
  }

  const recurrenceRules = all(lines, 'RRULE').map((line) => line.value.trim().toUpperCase());
  if (recurrenceRules.length > 1) errors.push('Only one RRULE is supported per recurring master.');
  const recurrenceDates: ParsedCalendarEventIcsDateValue[] = [];
  const exclusionDates: ParsedCalendarEventIcsDateValue[] = [];
  for (const line of all(lines, 'RDATE')) {
    const parsed = parseDateList(line);
    recurrenceDates.push(...parsed.values);
    errors.push(...parsed.errors);
  }
  for (const line of all(lines, 'EXDATE')) {
    const parsed = parseDateList(line);
    exclusionDates.push(...parsed.values);
    errors.push(...parsed.errors);
  }

  if (
    lines.some(
      (line) => !supportedEventProperties.has(line.name) && !['BEGIN', 'END'].includes(line.name),
    )
  ) {
    warnings.push('Unsupported non-critical VEVENT properties were ignored.');
  }

  const componentValue = {
    uid,
    title,
    details,
    location,
    eventType: uniqueCategories[0],
    status,
    sequence: unescapeText(one(lines, 'SEQUENCE')?.value ?? '') || undefined,
    lastModified: unescapeText(one(lines, 'LAST-MODIFIED')?.value ?? '') || undefined,
    start,
    end,
    recurrenceId,
    recurrenceRange,
    recurrenceRules,
    recurrenceDates,
    exclusionDates,
    presentFields: [...new Set(lines.map((line) => line.name))],
  };
  return {
    sourceRow: firstRow,
    eventOrdinal,
    externalKey: uid,
    ...componentValue,
    validationErrors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    componentFingerprint: stableImportFingerprint(componentValue),
  };
}

function componentToRow(component: ParsedCalendarEventIcsComponent): ParsedCalendarEventIcsRow {
  const errors = [...component.validationErrors];
  const start = component.start;
  const end = component.end;
  if (!component.title) errors.push('SUMMARY is required.');
  if (component.status === 'CANCELLED') errors.push('STATUS:CANCELLED is not imported.');
  let endDate = end?.date;
  if (start?.kind === 'date') {
    endDate = endDate ? previousDate(endDate) : start.date;
  }
  if (start && endDate && endDate < start.date) errors.push('DTEND occurs before DTSTART.');
  if (
    start?.kind === 'date-time' &&
    end?.kind === 'date-time' &&
    end.date === start.date &&
    end.minute! <= start.minute!
  ) {
    errors.push('DTEND must be after DTSTART on the same date.');
  }
  return {
    sourceRow: component.sourceRow,
    eventOrdinal: component.eventOrdinal,
    externalKey: component.externalKey,
    title: component.title,
    details: component.details,
    location: component.location,
    startDate: start?.date ?? '',
    endDate,
    startMinute: start?.minute,
    endMinute: end?.minute,
    timeZone: start?.timeZone,
    eventType: component.eventType,
    status: component.status,
    sequence: component.sequence,
    lastModified: component.lastModified,
    presentFields: component.presentFields,
    validationErrors: [...new Set(errors)],
    warnings: component.warnings,
  };
}

function validateTimeZone(timeZone: ParsedTimeZone): void {
  const names = new Set(timeZone.lines.map((line) => line.name));
  if (!timeZone.tzid) timeZone.validationErrors.push('VTIMEZONE requires TZID.');
  if (!names.has('BEGIN') || !names.has('END')) {
    timeZone.validationErrors.push(`VTIMEZONE ${timeZone.tzid || '(unknown)'} is malformed.`);
  }
  const hasObservance = timeZone.lines.some(
    (line) => line.name === 'BEGIN' && ['STANDARD', 'DAYLIGHT'].includes(line.value.toUpperCase()),
  );
  if (!hasObservance) {
    timeZone.validationErrors.push(
      `VTIMEZONE ${timeZone.tzid || '(unknown)'} requires STANDARD or DAYLIGHT rules.`,
    );
  }
}

function referencedTzids(component: ParsedCalendarEventIcsComponent): string[] {
  return [
    component.start,
    component.end,
    component.recurrenceId,
    ...component.recurrenceDates,
    ...component.exclusionDates,
  ]
    .map((value) => value?.timeZone)
    .filter((value): value is string => Boolean(value && value !== 'UTC'));
}

async function validateWithIcalJs(text: string): Promise<void> {
  try {
    const loaded = (await import('ical.js')) as unknown as {
      default?: { parse?: (value: string) => unknown };
      parse?: (value: string) => unknown;
    };
    const parser = loaded.default?.parse ?? loaded.parse;
    if (typeof parser !== 'function') throw new Error('The recurrence parser is unavailable.');
    parser(text);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'Unknown iCalendar parser error.';
    throw new Error(`The ICS source is not valid RFC 5545 data: ${detail}`);
  }
}

export async function parseCalendarEventIcs(text: string): Promise<ParsedCalendarEventIcs> {
  await validateWithIcalJs(text);
  const logicalLines = unfoldLines(text);
  if (logicalLines.length === 0) throw new Error('The ICS file is empty.');
  const parsed = logicalLines.map((line) => parseContentLine(line.value, line.sourceRow));
  if (parsed[0]?.name !== 'BEGIN' || parsed[0].value.trim().toUpperCase() !== 'VCALENDAR') {
    throw new Error('The ICS source must begin with BEGIN:VCALENDAR.');
  }
  if (parsed.at(-1)?.name !== 'END' || parsed.at(-1)?.value.trim().toUpperCase() !== 'VCALENDAR') {
    throw new Error('The ICS source must end with END:VCALENDAR.');
  }

  const diagnostics: CalendarEventIcsDiagnostic[] = [];
  let calendarMethod: string | undefined;
  const eventLines: ContentLine[][] = [];
  const timeZoneLines: ContentLine[][] = [];
  let currentEvent: ContentLine[] | undefined;
  let currentTimeZone: ContentLine[] | undefined;
  let timeZoneDepth = 0;
  let inAlarm = false;

  for (const line of parsed.slice(1, -1)) {
    const componentValue = line.value.trim().toUpperCase();
    if (line.name === 'BEGIN' && componentValue === 'VEVENT' && !currentTimeZone) {
      if (currentEvent) throw new Error(`Line ${line.sourceRow} begins a nested VEVENT.`);
      currentEvent = [];
      continue;
    }
    if (line.name === 'END' && componentValue === 'VEVENT' && currentEvent) {
      eventLines.push(currentEvent);
      currentEvent = undefined;
      inAlarm = false;
      continue;
    }
    if (line.name === 'BEGIN' && componentValue === 'VTIMEZONE' && !currentEvent) {
      if (currentTimeZone) throw new Error(`Line ${line.sourceRow} begins a nested VTIMEZONE.`);
      currentTimeZone = [line];
      timeZoneDepth = 1;
      continue;
    }
    if (currentTimeZone) {
      currentTimeZone.push(line);
      if (line.name === 'BEGIN') timeZoneDepth += 1;
      if (line.name === 'END') timeZoneDepth -= 1;
      if (timeZoneDepth === 0) {
        timeZoneLines.push(currentTimeZone);
        currentTimeZone = undefined;
      }
      continue;
    }
    if (currentEvent) {
      if (line.name === 'BEGIN' && componentValue === 'VALARM') {
        inAlarm = true;
        diagnostics.push({
          severity: 'warning',
          message: 'VALARM was ignored; Calendar import never creates reminders automatically.',
          sourceRow: line.sourceRow,
          eventOrdinal: eventLines.length + 1,
        });
        continue;
      }
      if (line.name === 'END' && componentValue === 'VALARM') {
        inAlarm = false;
        continue;
      }
      if (!inAlarm) currentEvent.push(line);
    } else if (line.name === 'METHOD') {
      calendarMethod = line.value.trim();
    } else if (
      !['VERSION', 'PRODID', 'CALSCALE', 'X-WR-CALNAME', 'X-WR-TIMEZONE'].includes(line.name)
    ) {
      diagnostics.push({
        severity: 'warning',
        message: `Calendar property ${line.name} was ignored.`,
        sourceRow: line.sourceRow,
      });
    }
  }
  if (currentEvent) throw new Error('The ICS source contains an unclosed VEVENT.');
  if (currentTimeZone) throw new Error('The ICS source contains an unclosed VTIMEZONE.');
  if (eventLines.length === 0) throw new Error('The ICS source contains no VEVENT components.');
  if (eventLines.length > MAX_CALENDAR_EVENT_ICS_ROWS) {
    throw new Error(
      `Import no more than ${MAX_CALENDAR_EVENT_ICS_ROWS.toLocaleString('en-US')} VEVENT components at a time.`,
    );
  }

  const timeZones = timeZoneLines.map((lines) => {
    const zone: ParsedTimeZone = {
      tzid: unescapeText(one(lines, 'TZID')?.value ?? ''),
      lines,
      sourceRow: lines[0]?.sourceRow ?? 0,
      validationErrors: [],
    };
    validateTimeZone(zone);
    return zone;
  });
  const timeZoneById = new Map<string, ParsedTimeZone[]>();
  for (const zone of timeZones) {
    const collection = timeZoneById.get(zone.tzid) ?? [];
    collection.push(zone);
    timeZoneById.set(zone.tzid, collection);
  }
  const calendarTimeZoneFingerprint = stableImportFingerprint(
    timeZones
      .map((zone) => ({
        tzid: zone.tzid,
        lines: zone.lines.map((line) => ({
          name: line.name,
          params: [...line.params.entries()].sort(),
          value: line.value,
        })),
      }))
      .sort((first, second) => first.tzid.localeCompare(second.tzid)),
  );

  const components = eventLines.map((lines, index) =>
    parseEventComponent(lines, index + 1, calendarMethod),
  );

  const byUid = new Map<string, ParsedCalendarEventIcsComponent[]>();
  for (const component of components) {
    const list = byUid.get(component.externalKey) ?? [];
    list.push(component);
    byUid.set(component.externalKey, list);
  }

  const rows: ParsedCalendarEventIcsRow[] = [];
  const series: ParsedCalendarEventIcsSeries[] = [];
  for (const [uid, grouped] of byUid) {
    const masters = grouped.filter((component) => !component.recurrenceId);
    const overrides = grouped.filter((component) => Boolean(component.recurrenceId));
    const recurring =
      overrides.length > 0 ||
      masters.some(
        (component) =>
          component.recurrenceRules.length > 0 ||
          component.recurrenceDates.length > 0 ||
          component.exclusionDates.length > 0,
      );
    if (!recurring && masters.length === 1) {
      rows.push(componentToRow(masters[0]!));
      continue;
    }

    for (const component of grouped) {
      for (const tzid of new Set(referencedTzids(component))) {
        const definitions = timeZoneById.get(tzid) ?? [];
        if (definitions.length === 0) {
          component.validationErrors.push(`TZID ${tzid} requires a matching VTIMEZONE definition.`);
        } else if (definitions.length > 1) {
          component.validationErrors.push(`TZID ${tzid} has duplicate VTIMEZONE definitions.`);
        } else {
          component.validationErrors.push(...definitions[0]!.validationErrors);
        }
      }
    }

    const validationErrors: string[] = [];
    const warnings: string[] = [];
    if (!uid) validationErrors.push('Recurring series UID is required.');
    if (masters.length !== 1) {
      validationErrors.push('A recurring UID requires exactly one master VEVENT.');
    }
    const master = masters[0];
    if (master?.status === 'CANCELLED') {
      validationErrors.push('A recurring master with STATUS:CANCELLED is not imported.');
    }
    const duplicateOverrideKeys = new Set<string>();
    const seenOverrideKeys = new Set<string>();
    for (const override of overrides) {
      const key = override.recurrenceId
        ? `${override.recurrenceId.zoneForm}\u0000${override.recurrenceId.date}\u0000${override.recurrenceId.minute ?? ''}`
        : '';
      if (seenOverrideKeys.has(key)) duplicateOverrideKeys.add(key);
      seenOverrideKeys.add(key);
    }
    if (duplicateOverrideKeys.size > 0) {
      validationErrors.push('A recurring UID contains duplicate RECURRENCE-ID overrides.');
    }
    validationErrors.push(
      ...(master?.validationErrors ?? []),
      ...overrides.flatMap((component) => component.validationErrors),
    );
    warnings.push(
      ...(master?.warnings ?? []),
      ...overrides.flatMap((component) => component.warnings),
    );
    series.push({
      sourceRow: master?.sourceRow ?? grouped[0]?.sourceRow ?? 0,
      eventOrdinal: master?.eventOrdinal ?? grouped[0]?.eventOrdinal ?? 0,
      externalKey: uid,
      master,
      overrides,
      validationErrors: [...new Set(validationErrors)],
      warnings: [...new Set(warnings)],
      masterFingerprint: stableImportFingerprint({
        master: master?.componentFingerprint,
        overrides: overrides
          .map((component) => component.componentFingerprint)
          .sort((first, second) => first.localeCompare(second)),
        recurrenceEngineVersion: CALENDAR_EVENT_RECURRENCE_ENGINE_VERSION,
      }),
      calendarTimeZoneFingerprint,
    });
  }

  return {
    rows: rows.sort((first, second) => first.eventOrdinal - second.eventOrdinal),
    series: series.sort((first, second) => first.eventOrdinal - second.eventOrdinal),
    diagnostics,
    sourceFingerprint: stableImportFingerprint({
      rows: rows.map((row) => ({ ...row, sourceRow: 0 })),
      series: series.map((value) => ({
        externalKey: value.externalKey,
        masterFingerprint: value.masterFingerprint,
        calendarTimeZoneFingerprint: value.calendarTimeZoneFingerprint,
        validationErrors: value.validationErrors,
      })),
      recurrenceEngineVersion: CALENDAR_EVENT_RECURRENCE_ENGINE_VERSION,
    }),
    calendarTimeZoneFingerprint,
    recurrenceEngineVersion: CALENDAR_EVENT_RECURRENCE_ENGINE_VERSION,
    componentCount: components.length,
  };
}
