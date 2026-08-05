import { stableImportFingerprint } from '@/features/importCenter/importPreviewModel';

export const MAX_CALENDAR_EVENT_ICS_ROWS = 5_000;

export type CalendarEventIcsDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface CalendarEventIcsDiagnostic {
  severity: CalendarEventIcsDiagnosticSeverity;
  message: string;
  sourceRow?: number;
  eventOrdinal?: number;
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

export interface ParsedCalendarEventIcs {
  rows: ParsedCalendarEventIcsRow[];
  diagnostics: CalendarEventIcsDiagnostic[];
  sourceFingerprint: string;
}

interface ContentLine {
  name: string;
  params: Map<string, string>;
  value: string;
  sourceRow: number;
}

interface IcsDateValue {
  kind: 'date' | 'date-time';
  date: string;
  minute?: number;
  timeZone?: string;
  zoneForm: 'date' | 'utc' | 'floating' | `tzid:${string}`;
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

function parseDateValue(line: ContentLine): { value?: IcsDateValue; error?: string } {
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
    return { value: { kind: 'date', date, zoneForm: 'date' } };
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
  if (hour > 23 || minute > 59 || second > 59)
    return { error: `${line.name} contains an invalid time.` };
  const utc = match[7] === 'Z';
  const tzid = line.params.get('TZID')?.trim();
  if (utc && tzid) return { error: `${line.name} cannot combine UTC Z notation with TZID.` };
  const timeZone = utc ? 'UTC' : tzid || undefined;
  const zoneForm: IcsDateValue['zoneForm'] = utc ? 'utc' : tzid ? `tzid:${tzid}` : 'floating';
  const value: IcsDateValue = {
    kind: 'date-time',
    date,
    minute: hour * 60 + minute,
    timeZone,
    zoneForm,
  };
  return second === 0
    ? { value }
    : {
        value,
        error: `${line.name} contains non-zero seconds, which cannot be stored without truncation.`,
      };
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
]);

function parseEvent(
  lines: readonly ContentLine[],
  eventOrdinal: number,
  calendarMethod: string | undefined,
): ParsedCalendarEventIcsRow {
  const firstRow = lines[0]?.sourceRow ?? eventOrdinal;
  const errors: string[] = [];
  const warnings: string[] = [];
  const uid = unescapeText(one(lines, 'UID')?.value ?? '');
  const title = unescapeText(one(lines, 'SUMMARY')?.value ?? '');
  if (!uid) errors.push('UID is required.');
  if (!title) errors.push('SUMMARY is required.');
  if (uid.length > 500) errors.push('UID exceeds 500 characters.');
  if (title.length > 500) errors.push('SUMMARY exceeds 500 characters.');
  if (/\p{Cc}/u.test(uid)) errors.push('UID contains control characters.');

  const starts = all(lines, 'DTSTART');
  const ends = all(lines, 'DTEND');
  if (starts.length !== 1) errors.push('Exactly one DTSTART is required.');
  if (ends.length > 1) errors.push('At most one DTEND is supported.');
  const startResult = starts[0] ? parseDateValue(starts[0]) : {};
  const endResult = ends[0] ? parseDateValue(ends[0]) : {};
  if (startResult.error) errors.push(startResult.error);
  if (endResult.error) errors.push(endResult.error);
  const start = startResult.value;
  const end = endResult.value;
  if (start && end && start.kind !== end.kind) {
    errors.push('DTSTART and DTEND must both be all-day values or both be timed values.');
  }
  if (start && end && start.zoneForm !== end.zoneForm) {
    errors.push('DTSTART and DTEND must use the same UTC, TZID, or floating-time form.');
  }

  let endDate = end?.date;
  if (start?.kind === 'date') {
    if (endDate) endDate = previousDate(endDate);
    else endDate = start.date;
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

  for (const recurrenceName of ['RRULE', 'RDATE', 'EXDATE', 'RECURRENCE-ID']) {
    if (all(lines, recurrenceName).length > 0) {
      errors.push(`${recurrenceName} is not supported in this phase.`);
    }
  }
  if (all(lines, 'DURATION').length > 0)
    errors.push('DURATION is not supported; provide an explicit DTEND.');

  const status = unescapeText(one(lines, 'STATUS')?.value ?? '').toUpperCase() || undefined;
  if (status === 'CANCELLED') errors.push('STATUS:CANCELLED is not imported.');
  else if (status === 'TENTATIVE')
    warnings.push('TENTATIVE status requires explicit acknowledgement.');
  else if (status && status !== 'CONFIRMED')
    warnings.push(`STATUS:${status} is retained only in the import audit.`);
  if (calendarMethod?.toUpperCase() === 'CANCEL')
    errors.push('METHOD:CANCEL calendars are not imported.');

  const categoryValues = all(lines, 'CATEGORIES').flatMap((line) => splitEscapedComma(line.value));
  const uniqueCategories = [
    ...new Map(categoryValues.map((value) => [value.toLocaleLowerCase('en-US'), value])).values(),
  ];
  if (uniqueCategories.length > 1)
    errors.push('CATEGORIES contains more than one Calendar Event Type.');

  const details = unescapeText(one(lines, 'DESCRIPTION')?.value ?? '') || undefined;
  const location = unescapeText(one(lines, 'LOCATION')?.value ?? '') || undefined;
  if (details && details.length > 10_000) errors.push('DESCRIPTION exceeds 10,000 characters.');
  if (location && location.length > 1_000) errors.push('LOCATION exceeds 1,000 characters.');
  if (start?.timeZone && start.timeZone.length > 200) errors.push('TZID exceeds 200 characters.');
  if (start?.zoneForm.startsWith('tzid:')) {
    warnings.push(
      `TZID ${start.timeZone ?? ''} is retained as wall time; Classroom does not evaluate timezone rules.`,
    );
  }

  if (
    lines.some(
      (line) => !supportedEventProperties.has(line.name) && !['BEGIN', 'END'].includes(line.name),
    )
  ) {
    warnings.push('Unsupported non-critical VEVENT properties were ignored.');
  }

  return {
    sourceRow: firstRow,
    eventOrdinal,
    externalKey: uid,
    title,
    details,
    location,
    startDate: start?.date ?? '',
    endDate,
    startMinute: start?.minute,
    endMinute: end?.minute,
    timeZone: start?.timeZone,
    eventType: uniqueCategories[0],
    status,
    sequence: unescapeText(one(lines, 'SEQUENCE')?.value ?? '') || undefined,
    lastModified: unescapeText(one(lines, 'LAST-MODIFIED')?.value ?? '') || undefined,
    presentFields: [...new Set(lines.map((line) => line.name))],
    validationErrors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

export function parseCalendarEventIcs(text: string): ParsedCalendarEventIcs {
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
  const events: ContentLine[][] = [];
  let current: ContentLine[] | undefined;
  let inAlarm = false;
  for (const line of parsed.slice(1, -1)) {
    const componentValue = line.value.trim().toUpperCase();
    if (line.name === 'BEGIN' && componentValue === 'VEVENT') {
      if (current) throw new Error(`Line ${line.sourceRow} begins a nested VEVENT.`);
      current = [];
      continue;
    }
    if (line.name === 'END' && componentValue === 'VEVENT') {
      if (!current) throw new Error(`Line ${line.sourceRow} ends a VEVENT that was not opened.`);
      events.push(current);
      current = undefined;
      inAlarm = false;
      continue;
    }
    if (current) {
      if (line.name === 'BEGIN' && componentValue === 'VALARM') {
        inAlarm = true;
        diagnostics.push({
          severity: 'warning',
          message: 'VALARM was ignored; Calendar import never creates reminders automatically.',
          sourceRow: line.sourceRow,
          eventOrdinal: events.length + 1,
        });
        continue;
      }
      if (line.name === 'END' && componentValue === 'VALARM') {
        inAlarm = false;
        continue;
      }
      if (!inAlarm) current.push(line);
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
  if (current) throw new Error('The ICS source contains an unclosed VEVENT.');
  if (events.length === 0) throw new Error('The ICS source contains no VEVENT components.');
  if (events.length > MAX_CALENDAR_EVENT_ICS_ROWS) {
    throw new Error(
      `Import no more than ${MAX_CALENDAR_EVENT_ICS_ROWS.toLocaleString('en-US')} Calendar Events at a time.`,
    );
  }

  const rows = events.map((event, index) => parseEvent(event, index + 1, calendarMethod));
  return {
    rows,
    diagnostics,
    sourceFingerprint: stableImportFingerprint(
      rows.map((row) => ({
        ...row,
        sourceRow: 0,
        eventOrdinal: row.eventOrdinal,
      })),
    ),
  };
}
