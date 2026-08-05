import {
  calendarEventSchema,
  categoryAssignmentSchema,
  type CalendarEvent,
  type CategoryAssignment,
  type CategoryValue,
  type ClassificationMappingPreset,
  type SchoolYear,
} from '@/domain/models/entities';
import {
  buildImportPreview,
  stableImportFingerprint,
  type ImportPreview,
  type ImportPreviewRow,
} from '@/features/importCenter/importPreviewModel';
import {
  createImportClassificationResolutionSession,
  planImportClassificationAssignments,
  type ImportClassificationAuditRecord,
  type ImportClassificationDecisions,
  type ImportClassificationReview,
  type ImportClassificationRowResolution,
} from '@/features/importCenter/importClassificationResolution';
import type {
  ImportClassificationMappingAuditRecord,
  ImportClassificationMappingPersistenceDecisions,
} from '@/features/importCenter/importClassificationMappingPresetPlan';
import {
  createEmptyImportColumnMapping,
  mappedImportValue,
  normalizeImportText,
  suggestImportColumnMapping,
  type ImportColumnMapping,
  type ImportHeaderAliases,
  type ImportTable,
  type ImportTableRow,
} from '@/features/importCenter/importTableModel';

import type {
  CalendarEventIcsDiagnostic,
  ParsedCalendarEventIcs,
  ParsedCalendarEventIcsRow,
} from './calendarEventImportIcsParser';

export const MAX_CALENDAR_EVENT_IMPORT_ROWS = 5_000;

export const calendarEventImportFieldKeys = [
  'externalKey',
  'title',
  'description',
  'location',
  'startDate',
  'endDate',
  'startTime',
  'endTime',
  'timeZone',
  'eventType',
  'externalSource',
] as const;

export type CalendarEventImportFieldKey = (typeof calendarEventImportFieldKeys)[number];
export type CalendarEventImportColumnMapping = ImportColumnMapping<CalendarEventImportFieldKey>;

export const calendarEventImportFieldLabels: Record<CalendarEventImportFieldKey, string> = {
  externalKey: 'Event ID / external key',
  title: 'Title',
  description: 'Description',
  location: 'Location',
  startDate: 'Start date',
  endDate: 'End date (inclusive)',
  startTime: 'Start time',
  endTime: 'End time',
  timeZone: 'Time zone',
  eventType: 'Calendar Event Type',
  externalSource: 'External source namespace',
};

const aliases: ImportHeaderAliases<CalendarEventImportFieldKey> = {
  externalKey: ['eventid', 'externalkey', 'eventkey', 'uid', 'id'],
  title: ['title', 'summary', 'eventtitle', 'name'],
  description: ['description', 'details', 'notes'],
  location: ['location', 'place', 'venue'],
  startDate: ['startdate', 'date', 'eventdate', 'begindate'],
  endDate: ['enddate', 'throughdate', 'finishdate'],
  startTime: ['starttime', 'begintime', 'time'],
  endTime: ['endtime', 'finishtime'],
  timeZone: ['timezone', 'tzid', 'zone'],
  eventType: ['eventtype', 'calendareventtype', 'category', 'categories', 'type'],
  externalSource: ['externalsource', 'sourcenamespace', 'calendar', 'source'],
};

export function createEmptyCalendarEventImportMapping(): CalendarEventImportColumnMapping {
  return createEmptyImportColumnMapping(calendarEventImportFieldKeys);
}

export function suggestCalendarEventImportMapping(
  headers: readonly string[],
): CalendarEventImportColumnMapping {
  return suggestImportColumnMapping(headers, calendarEventImportFieldKeys, aliases);
}

export interface CalendarEventImportDefaults {
  externalSource?: string;
}

export type CalendarEventDuplicateDecision =
  { action: 'create' } | { action: 'skip' } | { action: 'update'; targetId: string };

export type CalendarEventDuplicateDecisions = Record<
  number,
  CalendarEventDuplicateDecision | undefined
>;
export type CalendarEventTentativeAcknowledgements = Record<number, boolean | undefined>;

export interface CalendarEventDuplicateCandidate {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  imported: boolean;
  canUpdate: boolean;
}

export interface CalendarEventDuplicateReview {
  message: string;
  candidates: CalendarEventDuplicateCandidate[];
}

export interface NormalizedCalendarEventImportRow {
  sourceRow: number;
  eventOrdinal?: number;
  externalSource: string;
  externalKey: string;
  importIdentityKey: string;
  title: string;
  details?: string;
  location?: string;
  startDate: string;
  endDate: string;
  startMinute?: number;
  endMinute?: number;
  timeZone?: string;
  eventType?: string;
  status?: string;
  sequence?: string;
  lastModified?: string;
  presentFields: CalendarEventImportFieldKey[];
  warnings: string[];
  validationErrors: string[];
}

export interface PlannedCalendarEventImportRow {
  normalized: NormalizedCalendarEventImportRow;
  event?: CalendarEvent;
  existingEvent?: CalendarEvent;
  expectedAssignments: CategoryAssignment[];
  assignmentsToDelete: CategoryAssignment[];
  assignmentsToCreate: CategoryAssignment[];
  duplicateReview?: CalendarEventDuplicateReview;
  classificationReviews: ImportClassificationReview[];
}

export interface CalendarEventImportPreviewRow extends ImportPreviewRow<PlannedCalendarEventImportRow> {
  normalized: NormalizedCalendarEventImportRow;
  duplicateReview?: CalendarEventDuplicateReview;
  classificationReviews: ImportClassificationReview[];
}

export interface CalendarEventImportOutcomeAudit {
  sourceRow: number;
  eventOrdinal?: number;
  classification: CalendarEventImportPreviewRow['classification'];
  identity: string;
  targetEventId?: string;
  status?: string;
  sequence?: string;
  lastModified?: string;
  warnings: string[];
}

export interface CalendarEventImportPreview extends Omit<
  ImportPreview<PlannedCalendarEventImportRow>,
  'rows'
> {
  importRunId: string;
  rows: CalendarEventImportPreviewRow[];
  schoolYear: SchoolYear;
  sourceKind: 'ics' | 'csv' | 'xlsx';
  sourceContentFingerprint: string;
  defaults: CalendarEventImportDefaults;
  parserDiagnostics: CalendarEventIcsDiagnostic[];
  outcomeAudit: CalendarEventImportOutcomeAudit[];
  newCategoryValues: CategoryValue[];
  restoredCategoryValues: Array<{ before: CategoryValue; after: CategoryValue }>;
  expectedCategoryValues: CategoryValue[];
  classificationReviews: ImportClassificationReview[];
  classificationAudit: ImportClassificationAuditRecord[];
  newMappingPresets: ClassificationMappingPreset[];
  updatedMappingPresets: Array<{
    before: ClassificationMappingPreset;
    after: ClassificationMappingPreset;
  }>;
  expectedMappingPresets: ClassificationMappingPreset[];
  classificationMappingAudit: ImportClassificationMappingAuditRecord[];
  earliestCommittedStartDate?: string;
}

export type CalendarEventImportSource =
  | { kind: 'ics'; parsed: ParsedCalendarEventIcs }
  | {
      kind: 'tabular';
      sourceKind: 'csv' | 'xlsx';
      table: ImportTable;
      mapping: CalendarEventImportColumnMapping;
      defaults: CalendarEventImportDefaults;
    };

export interface BuildCalendarEventImportPreviewInput {
  source: CalendarEventImportSource;
  schoolYear: SchoolYear;
  duplicateDecisions: CalendarEventDuplicateDecisions;
  tentativeAcknowledgements: CalendarEventTentativeAcknowledgements;
  classificationDecisions: ImportClassificationDecisions;
  mappingPersistenceDecisions?: ImportClassificationMappingPersistenceDecisions;
  existingEvents: readonly CalendarEvent[];
  categoryValues: readonly CategoryValue[];
  mappingPresets?: readonly ClassificationMappingPreset[];
  categoryAssignments: readonly CategoryAssignment[];
}

export interface CalendarEventImportPreviewDependencies {
  createId?: () => string;
  now?: () => string;
}

function optional(value: string): string | undefined {
  return value || undefined;
}

function normalizeNamespace(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function normalizeExternalKey(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function buildCalendarEventIcsIdentity(uid: string): string {
  return `calendar-event\u0000ics\u0000${normalizeExternalKey(uid)}`;
}

export function buildCalendarEventTabularIdentity(
  externalSource: string,
  externalKey: string,
): string {
  return `calendar-event\u0000tabular\u0000${normalizeNamespace(externalSource)}\u0000${normalizeExternalKey(externalKey)}`;
}

export function calendarEventImportSourceContentFingerprint(
  source: CalendarEventImportSource,
): string {
  if (source.kind === 'ics') return source.parsed.sourceFingerprint;
  return stableImportFingerprint({
    table: source.table,
    mapping: source.mapping,
    defaults: {
      externalSource: optional(normalizeImportText(source.defaults.externalSource ?? '')),
    },
  });
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3])
  );
}

function parseTime(value: string, label: string): { minute?: number; error?: string } {
  if (!value) return {};
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { error: `${label} must use HH:MM in 24-hour time.` };
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return { error: `${label} contains an invalid time.` };
  return { minute: hour * 60 + minute };
}

function normalizedTitle(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function probableDuplicateKey(value: {
  title: string;
  startDate: string;
  endDate?: string;
  startMinute?: number;
  endMinute?: number;
}): string {
  return [
    normalizedTitle(value.title),
    value.startDate,
    value.endDate ?? value.startDate,
    value.startMinute ?? '',
    value.endMinute ?? '',
  ].join('\u0000');
}

function valueFor(
  row: ImportTableRow,
  mapping: CalendarEventImportColumnMapping,
  key: CalendarEventImportFieldKey,
): string {
  return mappedImportValue(row, mapping, key);
}

function validateCommon(row: NormalizedCalendarEventImportRow, schoolYear: SchoolYear): void {
  const errors = row.validationErrors;
  if (!row.externalKey) errors.push('Event ID / external key is required.');
  if (!row.externalSource) errors.push('External source namespace is required.');
  if (!row.title) errors.push('Title is required.');
  if (!row.startDate) errors.push('Start date is required.');
  if (row.externalKey.length > 500) errors.push('Event ID exceeds 500 characters.');
  if (row.externalSource.length > 500) errors.push('External source exceeds 500 characters.');
  if (row.title.length > 500) errors.push('Title exceeds 500 characters.');
  if (row.details && row.details.length > 10_000)
    errors.push('Description exceeds 10,000 characters.');
  if (row.location && row.location.length > 1_000)
    errors.push('Location exceeds 1,000 characters.');
  if (row.timeZone && row.timeZone.length > 200) errors.push('Time zone exceeds 200 characters.');
  if (/\p{Cc}/u.test(row.externalKey)) errors.push('Event ID contains control characters.');
  if (/\p{Cc}/u.test(row.externalSource))
    errors.push('External source contains control characters.');
  if (row.importIdentityKey.length > 1_200)
    errors.push('The Calendar Event import identity exceeds 1,200 characters.');
  if (row.startDate && row.endDate && row.endDate < row.startDate) {
    errors.push('End date must be on or after start date.');
  }
  if (
    row.startMinute !== undefined &&
    row.endMinute !== undefined &&
    row.startDate === row.endDate &&
    row.endMinute <= row.startMinute
  ) {
    errors.push('End time must be after start time on the same date.');
  }
  if (row.startDate && row.endDate) {
    if (row.startDate < schoolYear.startsOn || row.endDate > schoolYear.endsOn) {
      errors.push(
        `The Event must fall within ${schoolYear.startsOn} through ${schoolYear.endsOn}.`,
      );
    }
  }
}

function normalizeTabularRow(
  row: ImportTableRow,
  mapping: CalendarEventImportColumnMapping,
  defaults: CalendarEventImportDefaults,
  schoolYear: SchoolYear,
): NormalizedCalendarEventImportRow {
  const validationErrors: string[] = [];
  const externalKey = normalizeExternalKey(valueFor(row, mapping, 'externalKey'));
  const externalSource = normalizeNamespace(
    valueFor(row, mapping, 'externalSource') || normalizeImportText(defaults.externalSource ?? ''),
  );
  const title = valueFor(row, mapping, 'title');
  const startDate = valueFor(row, mapping, 'startDate');
  const endDate = valueFor(row, mapping, 'endDate') || startDate;
  if (startDate && !validDate(startDate)) validationErrors.push('Start date must use YYYY-MM-DD.');
  if (endDate && !validDate(endDate)) validationErrors.push('End date must use YYYY-MM-DD.');
  const start = parseTime(valueFor(row, mapping, 'startTime'), 'Start time');
  const end = parseTime(valueFor(row, mapping, 'endTime'), 'End time');
  if (start.error) validationErrors.push(start.error);
  if (end.error) validationErrors.push(end.error);
  if (end.minute !== undefined && start.minute === undefined) {
    validationErrors.push('End time cannot be supplied without a start time.');
  }
  const importIdentityKey =
    externalSource && externalKey
      ? buildCalendarEventTabularIdentity(externalSource, externalKey)
      : '';
  const normalized: NormalizedCalendarEventImportRow = {
    sourceRow: row.sourceRow,
    externalSource,
    externalKey,
    importIdentityKey,
    title,
    details: optional(valueFor(row, mapping, 'description')),
    location: optional(valueFor(row, mapping, 'location')),
    startDate,
    endDate,
    startMinute: start.minute,
    endMinute: end.minute,
    timeZone: optional(valueFor(row, mapping, 'timeZone')),
    eventType: optional(valueFor(row, mapping, 'eventType')),
    presentFields: calendarEventImportFieldKeys.filter((key) => mapping[key] !== null),
    warnings: [],
    validationErrors,
  };
  validateCommon(normalized, schoolYear);
  return normalized;
}

function normalizeIcsRow(
  row: ParsedCalendarEventIcsRow,
  schoolYear: SchoolYear,
): NormalizedCalendarEventImportRow {
  const externalKey = normalizeExternalKey(row.externalKey);
  const normalized: NormalizedCalendarEventImportRow = {
    sourceRow: row.sourceRow,
    eventOrdinal: row.eventOrdinal,
    externalSource: 'ics',
    externalKey,
    importIdentityKey: externalKey ? buildCalendarEventIcsIdentity(externalKey) : '',
    title: row.title,
    details: row.details,
    location: row.location,
    startDate: row.startDate,
    endDate: row.endDate ?? row.startDate,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    timeZone: row.timeZone,
    eventType: row.eventType,
    status: row.status,
    sequence: row.sequence,
    lastModified: row.lastModified,
    presentFields: [
      'externalKey',
      'title',
      'startDate',
      'endDate',
      ...(row.presentFields.includes('DESCRIPTION') ? (['description'] as const) : []),
      ...(row.presentFields.includes('LOCATION') ? (['location'] as const) : []),
      ...(row.presentFields.includes('DTSTART') ? (['startTime', 'timeZone'] as const) : []),
      ...(row.presentFields.includes('DTEND') ? (['endTime'] as const) : []),
      ...(row.presentFields.includes('CATEGORIES') ? (['eventType'] as const) : []),
      'externalSource',
    ],
    warnings: [...row.warnings],
    validationErrors: [...row.validationErrors],
  };
  validateCommon(normalized, schoolYear);
  return normalized;
}

function sameRecord(first: CalendarEvent, second: CalendarEvent): boolean {
  const firstComparable: Partial<CalendarEvent> = { ...first };
  const secondComparable: Partial<CalendarEvent> = { ...second };
  delete firstComparable.lastImportRunId;
  delete secondComparable.lastImportRunId;
  return stableImportFingerprint(firstComparable) === stableImportFingerprint(secondComparable);
}

function compareAssignment(first: CategoryAssignment, second: CategoryAssignment): number {
  return first.id.localeCompare(second.id);
}

function categoryValueMap(
  categoryValues: readonly CategoryValue[],
  snapshot: {
    newCategoryValues: readonly CategoryValue[];
    restoredCategoryValues: readonly { after: CategoryValue }[];
  },
): Map<string, CategoryValue> {
  const values = new Map(categoryValues.map((value) => [value.id, value] as const));
  for (const value of snapshot.newCategoryValues) values.set(value.id, value);
  for (const change of snapshot.restoredCategoryValues) values.set(change.after.id, change.after);
  return values;
}

function injectDefaultEventType(
  resolution: ImportClassificationRowResolution,
  defaultValueId: string | undefined,
): ImportClassificationRowResolution {
  if (!defaultValueId) return resolution;
  return {
    ...resolution,
    families: resolution.families.map((family) =>
      family.familyId === 'calendar-event-type'
        ? {
            ...family,
            inputPresent: true,
            hadInput: true,
            categoryValueIds: [defaultValueId],
          }
        : family,
    ),
  };
}

export function buildCalendarEventImportPreview(
  input: BuildCalendarEventImportPreviewInput,
  dependencies: CalendarEventImportPreviewDependencies = {},
): CalendarEventImportPreview {
  if (input.schoolYear.lifecycleState === 'archived' || !input.schoolYear.active) {
    throw new Error('Choose an active School Year for Calendar Event import.');
  }
  const createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
  const generatedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  const importRunId = createId();
  const sourceContentFingerprint = calendarEventImportSourceContentFingerprint(input.source);
  const defaults =
    input.source.kind === 'tabular'
      ? { externalSource: optional(normalizeNamespace(input.source.defaults.externalSource ?? '')) }
      : {};
  const parserDiagnostics = input.source.kind === 'ics' ? input.source.parsed.diagnostics : [];
  let normalizedRows: NormalizedCalendarEventImportRow[];
  if (input.source.kind === 'ics') {
    normalizedRows = input.source.parsed.rows.map((row) => normalizeIcsRow(row, input.schoolYear));
  } else {
    const tabularSource = input.source;
    normalizedRows = tabularSource.table.rows.map((row) =>
      normalizeTabularRow(row, tabularSource.mapping, tabularSource.defaults, input.schoolYear),
    );
  }
  if (normalizedRows.length === 0)
    throw new Error('The selected Calendar source contains no Events.');
  if (normalizedRows.length > MAX_CALENDAR_EVENT_IMPORT_ROWS) {
    throw new Error(
      `Import no more than ${MAX_CALENDAR_EVENT_IMPORT_ROWS.toLocaleString('en-US')} Calendar Events at a time.`,
    );
  }
  if (input.source.kind === 'tabular') {
    if (input.source.mapping.externalKey === null)
      throw new Error('Map Event ID before previewing.');
    if (input.source.mapping.title === null) throw new Error('Map Title before previewing.');
    if (input.source.mapping.startDate === null)
      throw new Error('Map Start date before previewing.');
  }

  const existingEvents = input.existingEvents.map((value) => calendarEventSchema.parse(value));
  const byId = new Map(existingEvents.map((event) => [event.id, event] as const));
  const byIdentity = new Map(
    existingEvents
      .filter((event) => event.importIdentityKey)
      .map((event) => [event.importIdentityKey!, event] as const),
  );
  const probableByKey = new Map<string, CalendarEvent[]>();
  for (const event of existingEvents.filter(
    (value) => value.schoolYearId === input.schoolYear.id,
  )) {
    const key = probableDuplicateKey(event);
    const values = probableByKey.get(key) ?? [];
    values.push(event);
    probableByKey.set(key, values);
  }

  const assignmentsByEvent = new Map<string, CategoryAssignment[]>();
  for (const assignment of input.categoryAssignments) {
    if (
      assignment.entityType !== 'calendar-event' ||
      assignment.familyId !== 'calendar-event-type'
    ) {
      continue;
    }
    const values = assignmentsByEvent.get(assignment.entityId) ?? [];
    values.push(categoryAssignmentSchema.parse(assignment));
    assignmentsByEvent.set(assignment.entityId, values);
  }
  for (const [eventId, assignments] of assignmentsByEvent) {
    assignmentsByEvent.set(eventId, assignments.sort(compareAssignment));
  }

  const identityCounts = new Map<string, number>();
  for (const row of normalizedRows) {
    if (!row.importIdentityKey) continue;
    identityCounts.set(row.importIdentityKey, (identityCounts.get(row.importIdentityKey) ?? 0) + 1);
  }

  const classificationSession = createImportClassificationResolutionSession({
    catalogType: 'calendar-event',
    categoryValues: input.categoryValues,
    mappingPresets: input.mappingPresets ?? [],
    decisions: input.classificationDecisions,
    mappingPersistenceDecisions: input.mappingPersistenceDecisions ?? {},
    createId,
    generatedAt,
  });
  const defaultEventType = input.categoryValues.find(
    (value) =>
      value.familyId === 'calendar-event-type' &&
      value.lifecycleState === 'active' &&
      value.isDefault,
  );

  const rows: CalendarEventImportPreviewRow[] = [];
  for (const normalized of normalizedRows) {
    const reasons = [...normalized.validationErrors];
    if ((identityCounts.get(normalized.importIdentityKey) ?? 0) > 1) {
      reasons.push(
        'This source repeats the same Calendar Event identity. Every duplicate is blocked.',
      );
    }
    if (reasons.length > 0) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: [...new Set(reasons)],
        normalized,
        classificationReviews: [],
      });
      continue;
    }

    const identityOwner = byIdentity.get(normalized.importIdentityKey);
    if (identityOwner && identityOwner.schoolYearId !== input.schoolYear.id) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: ['This stable Calendar Event identity belongs to another School Year.'],
        normalized,
        classificationReviews: [],
      });
      continue;
    }

    let target = identityOwner;
    let duplicateReview: CalendarEventDuplicateReview | undefined;
    if (!identityOwner) {
      const candidates = probableByKey.get(probableDuplicateKey(normalized)) ?? [];
      if (candidates.length > 0) {
        duplicateReview = {
          message:
            'Title, dates, and times match existing Events. Similarity never overwrites an Event automatically.',
          candidates: candidates.map((event) => ({
            id: event.id,
            title: event.title,
            startDate: event.startDate,
            endDate: event.endDate ?? event.startDate,
            imported: Boolean(event.importIdentityKey),
            canUpdate: !event.importIdentityKey,
          })),
        };
        const decision = input.duplicateDecisions[normalized.sourceRow];
        if (!decision) {
          rows.push({
            sourceRow: normalized.sourceRow,
            classification: 'review',
            reasons: [duplicateReview.message],
            normalized,
            duplicateReview,
            classificationReviews: [],
            planned: {
              normalized,
              expectedAssignments: [],
              assignmentsToDelete: [],
              assignmentsToCreate: [],
              duplicateReview,
              classificationReviews: [],
            },
          });
          continue;
        }
        if (decision.action === 'skip') {
          rows.push({
            sourceRow: normalized.sourceRow,
            classification: 'skip',
            reasons: ['The reviewed source Event is intentionally skipped.'],
            normalized,
            duplicateReview,
            classificationReviews: [],
          });
          continue;
        }
        if (decision.action === 'create') target = undefined;
        else {
          target = byId.get(decision.targetId);
          const selectedCandidate = candidates.find(
            (candidate) => candidate.id === decision.targetId,
          );
          if (!target || !selectedCandidate || target.schoolYearId !== input.schoolYear.id) {
            rows.push({
              sourceRow: normalized.sourceRow,
              classification: 'review',
              reasons: ['The selected Calendar Event is no longer available in this School Year.'],
              normalized,
              duplicateReview,
              classificationReviews: [],
            });
            continue;
          }
          if (target.importIdentityKey) {
            rows.push({
              sourceRow: normalized.sourceRow,
              classification: 'blocked',
              reasons: [
                'The selected Event already belongs to a different stable import identity.',
              ],
              normalized,
              duplicateReview,
              classificationReviews: [],
            });
            continue;
          }
        }
      }
    }

    if (
      normalized.status === 'TENTATIVE' &&
      !input.tentativeAcknowledgements[normalized.sourceRow]
    ) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'review',
        reasons: ['Acknowledge that TENTATIVE will be imported as a normal Calendar Event.'],
        normalized,
        duplicateReview,
        classificationReviews: [],
        planned: {
          normalized,
          existingEvent: target,
          expectedAssignments: target ? (assignmentsByEvent.get(target.id) ?? []) : [],
          assignmentsToDelete: [],
          assignmentsToCreate: [],
          duplicateReview,
          classificationReviews: [],
        },
      });
      continue;
    }

    const eventTypeInput = Boolean(normalized.eventType);
    let classification = classificationSession.resolveRow({
      sourceRow: normalized.sourceRow,
      values: { 'calendar-event-type': normalized.eventType },
      presentFamilyIds: eventTypeInput ? ['calendar-event-type'] : [],
    });
    if (!target && !eventTypeInput && defaultEventType) {
      classification = injectDefaultEventType(classification, defaultEventType.id);
    }
    if (classification.blockingReasons.length > 0) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'blocked',
        reasons: classification.blockingReasons,
        normalized,
        duplicateReview,
        classificationReviews: [],
      });
      continue;
    }
    if (classification.reviews.length > 0) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'review',
        reasons: classification.reviewReasons,
        normalized,
        duplicateReview,
        classificationReviews: classification.reviews,
        planned: {
          normalized,
          existingEvent: target,
          expectedAssignments: target ? (assignmentsByEvent.get(target.id) ?? []) : [],
          assignmentsToDelete: [],
          assignmentsToCreate: [],
          duplicateReview,
          classificationReviews: classification.reviews,
        },
      });
      continue;
    }

    const eventId = target?.id ?? createId();
    const assignmentPlan = planImportClassificationAssignments({
      entityId: eventId,
      entityType: 'calendar-event',
      existingAssignments: target ? (assignmentsByEvent.get(target.id) ?? []) : [],
      resolution: classification,
      applicableFamilyIds: ['calendar-event-type'],
      createId,
      generatedAt,
    });
    const currentSnapshot = classificationSession.snapshot();
    const valuesById = categoryValueMap(input.categoryValues, currentSnapshot);
    const selectedEventTypeId =
      assignmentPlan.desiredCategoryValueIdsByFamily['calendar-event-type']?.[0];
    const selectedEventType = selectedEventTypeId ? valuesById.get(selectedEventTypeId) : undefined;
    const allDay = normalized.startMinute === undefined;
    const eventWithoutRun = calendarEventSchema.parse({
      id: eventId,
      title: normalized.title,
      startDate: normalized.startDate,
      endDate: normalized.endDate,
      startMinute: allDay ? undefined : normalized.startMinute,
      endMinute: allDay ? undefined : normalized.endMinute,
      category: selectedEventType?.name ?? target?.category ?? 'Calendar',
      details: normalized.presentFields.includes('description')
        ? normalized.details
        : (target?.details ?? normalized.details),
      contextId: undefined,
      schoolYearId: input.schoolYear.id,
      location: normalized.presentFields.includes('location')
        ? normalized.location
        : (target?.location ?? normalized.location),
      timeZone: allDay ? undefined : normalized.timeZone,
      source: target?.source,
      externalSource: normalized.externalSource,
      externalKey: normalized.externalKey,
      importIdentityKey: normalized.importIdentityKey,
      lastImportRunId: target?.lastImportRunId,
    });
    const categoryChanged =
      assignmentPlan.assignmentsToDelete.length > 0 ||
      assignmentPlan.assignmentsToCreate.length > 0 ||
      classification.mappingPersistencePlanned;
    if (target && sameRecord(eventWithoutRun, target) && !categoryChanged) {
      rows.push({
        sourceRow: normalized.sourceRow,
        classification: 'skip',
        reasons: ['The stable Calendar Event identity already has the same reviewed values.'],
        normalized,
        duplicateReview,
        classificationReviews: [],
        planned: {
          normalized,
          existingEvent: target,
          expectedAssignments: assignmentPlan.expectedAssignments,
          assignmentsToDelete: [],
          assignmentsToCreate: [],
          duplicateReview,
          classificationReviews: [],
        },
      });
      continue;
    }

    const event = calendarEventSchema.parse({ ...eventWithoutRun, lastImportRunId: importRunId });
    rows.push({
      sourceRow: normalized.sourceRow,
      classification: target ? 'update' : 'create',
      reasons: [
        ...normalized.warnings,
        ...classification.mappingNotes,
        target
          ? 'The exact stable identity or explicit manual-Event decision updates this Event.'
          : 'No existing stable identity was selected; create a new Calendar Event.',
      ],
      normalized,
      duplicateReview,
      classificationReviews: [],
      planned: {
        normalized,
        event,
        existingEvent: target,
        expectedAssignments: assignmentPlan.expectedAssignments,
        assignmentsToDelete: assignmentPlan.assignmentsToDelete,
        assignmentsToCreate: assignmentPlan.assignmentsToCreate,
        duplicateReview,
        classificationReviews: [],
      },
    });
  }

  const sourceKind = input.source.kind === 'ics' ? 'ics' : input.source.sourceKind;
  const genericPreview = buildImportPreview(
    rows.map((row) => ({
      sourceRow: row.sourceRow,
      classification: row.classification,
      reasons: row.reasons,
      planned: row.planned,
    })),
    {
      sourceContentFingerprint,
      sourceKind,
      schoolYear: input.schoolYear,
      duplicateDecisions: input.duplicateDecisions,
      tentativeAcknowledgements: input.tentativeAcknowledgements,
      classificationDecisions: input.classificationDecisions,
      mappingPersistenceDecisions: input.mappingPersistenceDecisions ?? {},
    },
    generatedAt,
  );
  const classificationSnapshot = classificationSession.snapshot();
  const changedRows = rows.filter(
    (row) => row.classification === 'create' || row.classification === 'update',
  );
  return {
    ...genericPreview,
    importRunId,
    rows,
    schoolYear: input.schoolYear,
    sourceKind,
    sourceContentFingerprint,
    defaults,
    parserDiagnostics,
    outcomeAudit: rows.map((row) => ({
      sourceRow: row.sourceRow,
      eventOrdinal: row.normalized.eventOrdinal,
      classification: row.classification,
      identity: row.normalized.importIdentityKey,
      targetEventId: row.planned?.existingEvent?.id ?? row.planned?.event?.id,
      status: row.normalized.status,
      sequence: row.normalized.sequence,
      lastModified: row.normalized.lastModified,
      warnings: row.normalized.warnings,
    })),
    newCategoryValues: classificationSnapshot.newCategoryValues,
    restoredCategoryValues: classificationSnapshot.restoredCategoryValues,
    expectedCategoryValues: classificationSnapshot.expectedCategoryValues,
    classificationReviews: classificationSnapshot.classificationReviews,
    classificationAudit: classificationSnapshot.classificationAudit,
    newMappingPresets: classificationSnapshot.newMappingPresets,
    updatedMappingPresets: classificationSnapshot.updatedMappingPresets,
    expectedMappingPresets: classificationSnapshot.expectedMappingPresets,
    classificationMappingAudit: classificationSnapshot.classificationMappingAudit,
    earliestCommittedStartDate: changedRows.map((row) => row.normalized.startDate).sort()[0],
  };
}
