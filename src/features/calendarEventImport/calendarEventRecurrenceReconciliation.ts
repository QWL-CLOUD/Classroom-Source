import type {
  CalendarEvent,
  CalendarEventImportOccurrence,
  CalendarEventImportSeries,
  SchoolYear,
} from '@/domain/models/entities';
import { stableImportFingerprint } from '@/features/importCenter/importPreviewModel';

import type {
  ExpandedCalendarEventOccurrence,
  ExpandedCalendarEventSeries,
} from './calendarEventRecurrenceExpansion';

export type CalendarEventRecurrenceDecision =
  | { action: 'apply-source' }
  | { action: 'detach' }
  | { action: 'recreate' }
  | { action: 'suppress' }
  | { action: 'remove' };

export type CalendarEventRecurrenceDecisions = Record<
  string,
  CalendarEventRecurrenceDecision | undefined
>;

export type CalendarEventRecurrenceClassification =
  'create' | 'update' | 'remove' | 'skip' | 'review' | 'blocked';

export interface CalendarEventRecurrenceReconciliationRow {
  sourceRow: number;
  eventOrdinal: number;
  seriesIdentityKey: string;
  occurrenceIdentityKey: string;
  occurrenceKey: string;
  classification: CalendarEventRecurrenceClassification;
  reason: string;
  sourceStatus: CalendarEventImportOccurrence['sourceStatus'];
  sourceOccurrence?: ExpandedCalendarEventOccurrence;
  existingSeries?: CalendarEventImportSeries;
  existingOccurrence?: CalendarEventImportOccurrence;
  existingEvent?: CalendarEvent;
  locallyEdited: boolean;
  sourceChanged: boolean;
  managementAction:
    | 'materialize'
    | 'update-materialized'
    | 'remove-materialized'
    | 'suppress'
    | 'detach'
    | 'metadata-only';
}

export function buildCalendarEventSeriesIdentity(
  schoolYearId: string,
  externalKey: string,
): string {
  return `calendar-event-series\u0000ics\u0000${schoolYearId}\u0000${externalKey
    .normalize('NFKC')
    .trim()}`;
}

export function buildCalendarEventOccurrenceIdentity(
  seriesIdentityKey: string,
  occurrenceKey: string,
): string {
  return `${seriesIdentityKey}\u0000${occurrenceKey}`;
}

export function buildCalendarEventOccurrenceEventIdentity(occurrenceIdentityKey: string): string {
  return `calendar-event\u0000ics-recurrence\u0000${occurrenceIdentityKey}`;
}

export function calendarEventManagedFingerprint(event: CalendarEvent): string {
  const managed = { ...event };
  delete managed.lastImportRunId;
  return stableImportFingerprint(managed);
}

function rowForReview(
  base: Omit<
    CalendarEventRecurrenceReconciliationRow,
    'classification' | 'reason' | 'managementAction'
  >,
  reason: string,
): CalendarEventRecurrenceReconciliationRow {
  return { ...base, classification: 'review', reason, managementAction: 'metadata-only' };
}

export interface ReconcileCalendarEventRecurrenceInput {
  expanded: ExpandedCalendarEventSeries;
  schoolYear: SchoolYear;
  existingSeries: readonly CalendarEventImportSeries[];
  existingOccurrences: readonly CalendarEventImportOccurrence[];
  existingEvents: readonly CalendarEvent[];
  decisions: CalendarEventRecurrenceDecisions;
}

export function reconcileCalendarEventRecurrence(
  input: ReconcileCalendarEventRecurrenceInput,
): CalendarEventRecurrenceReconciliationRow[] {
  const seriesIdentityKey = buildCalendarEventSeriesIdentity(
    input.schoolYear.id,
    input.expanded.externalKey,
  );
  const existingSeries = input.existingSeries.find(
    (value) => value.seriesIdentityKey === seriesIdentityKey,
  );
  const occurrencesByIdentity = new Map(
    input.existingOccurrences
      .filter((value) => value.seriesId === existingSeries?.id)
      .map((value) => [value.occurrenceIdentityKey, value] as const),
  );
  const eventsById = new Map(input.existingEvents.map((value) => [value.id, value] as const));
  const sourceByIdentity = new Map<string, ExpandedCalendarEventOccurrence>();
  for (const occurrence of input.expanded.occurrences) {
    const identity = buildCalendarEventOccurrenceIdentity(
      seriesIdentityKey,
      occurrence.occurrenceKey,
    );
    sourceByIdentity.set(identity, occurrence);
  }

  const identities = new Set([...sourceByIdentity.keys(), ...occurrencesByIdentity.keys()]);
  const rows: CalendarEventRecurrenceReconciliationRow[] = [];
  for (const occurrenceIdentityKey of identities) {
    const sourceOccurrence = sourceByIdentity.get(occurrenceIdentityKey);
    const existingOccurrence = occurrencesByIdentity.get(occurrenceIdentityKey);
    const existingEvent = existingOccurrence?.eventId
      ? eventsById.get(existingOccurrence.eventId)
      : undefined;
    const sourceStatus: CalendarEventImportOccurrence['sourceStatus'] =
      sourceOccurrence?.sourceStatus ?? 'absent';
    const sourceChanged =
      sourceOccurrence?.sourceOccurrenceFingerprint !==
      existingOccurrence?.sourceOccurrenceFingerprint;
    const locallyEdited = Boolean(
      existingEvent &&
      existingOccurrence?.lastImportedEventFingerprint &&
      calendarEventManagedFingerprint(existingEvent) !==
        existingOccurrence.lastImportedEventFingerprint,
    );
    const base = {
      sourceRow: sourceOccurrence?.sourceRow ?? input.expanded.sourceRow,
      eventOrdinal: sourceOccurrence?.eventOrdinal ?? input.expanded.eventOrdinal,
      seriesIdentityKey,
      occurrenceIdentityKey,
      occurrenceKey:
        sourceOccurrence?.occurrenceKey ??
        existingOccurrence?.occurrenceKey ??
        occurrenceIdentityKey,
      sourceStatus,
      sourceOccurrence,
      existingSeries,
      existingOccurrence,
      existingEvent,
      locallyEdited,
      sourceChanged,
    };

    if (input.expanded.validationErrors.length > 0) {
      rows.push({
        ...base,
        classification: 'blocked',
        reason: input.expanded.validationErrors.join(' '),
        managementAction: 'metadata-only',
      });
      continue;
    }
    if (sourceOccurrence?.validationErrors.length) {
      rows.push({
        ...base,
        classification: 'blocked',
        reason: sourceOccurrence.validationErrors.join(' '),
        managementAction: 'metadata-only',
      });
      continue;
    }

    const active = sourceStatus === 'active' && Boolean(sourceOccurrence?.row);
    if (active) {
      if (!existingOccurrence) {
        rows.push({
          ...base,
          classification: 'create',
          reason: 'This source occurrence has not been imported into this School Year.',
          managementAction: 'materialize',
        });
        continue;
      }
      if (existingOccurrence.managementStatus === 'suppressed') {
        if (!sourceChanged) {
          rows.push({
            ...base,
            classification: 'skip',
            reason: 'The user previously chose to suppress this unchanged source occurrence.',
            managementAction: 'metadata-only',
          });
          continue;
        }
        const decision = input.decisions[occurrenceIdentityKey];
        if (!decision || !['recreate', 'suppress'].includes(decision.action)) {
          rows.push(
            rowForReview(
              base,
              'The meaning of this previously suppressed occurrence changed. Choose whether to recreate it or continue suppressing it.',
            ),
          );
        } else if (decision.action === 'recreate') {
          rows.push({
            ...base,
            classification: 'create',
            reason: 'Restore source management and recreate the changed occurrence.',
            managementAction: 'materialize',
          });
        } else {
          rows.push({
            ...base,
            classification: 'update',
            reason: 'Continue suppressing the changed source occurrence.',
            managementAction: 'suppress',
          });
        }
        continue;
      }
      if (existingOccurrence.managementStatus === 'detached') {
        rows.push({
          ...base,
          classification: sourceChanged ? 'update' : 'skip',
          reason: 'The occurrence is detached and its preserved Event remains manual.',
          managementAction: 'metadata-only',
        });
        continue;
      }
      if (!existingEvent) {
        const decision = input.decisions[occurrenceIdentityKey];
        if (!decision || !['recreate', 'suppress'].includes(decision.action)) {
          rows.push(
            rowForReview(
              base,
              'The managed Event was deleted. Choose whether to recreate it or preserve the deletion.',
            ),
          );
        } else if (decision.action === 'recreate') {
          rows.push({
            ...base,
            classification: 'create',
            reason: 'Recreate the manually deleted occurrence from the reviewed source.',
            managementAction: 'materialize',
          });
        } else {
          rows.push({
            ...base,
            classification: 'update',
            reason: 'Preserve the manual deletion as a suppression tombstone.',
            managementAction: 'suppress',
          });
        }
        continue;
      }
      if (locallyEdited) {
        const decision = input.decisions[occurrenceIdentityKey];
        if (!decision || !['apply-source', 'detach'].includes(decision.action)) {
          rows.push(
            rowForReview(
              base,
              'This occurrence was edited after import. Choose whether to apply the source or keep it as a manual Event.',
            ),
          );
        } else if (decision.action === 'apply-source') {
          rows.push({
            ...base,
            classification: 'update',
            reason: 'Apply the reviewed source values to the locally edited occurrence.',
            managementAction: 'update-materialized',
          });
        } else {
          rows.push({
            ...base,
            classification: 'update',
            reason: 'Keep the local Event and detach it from recurrence management.',
            managementAction: 'detach',
          });
        }
        continue;
      }
      if (sourceChanged) {
        rows.push({
          ...base,
          classification: 'update',
          reason: 'The source occurrence changed since the last reviewed import.',
          managementAction: 'update-materialized',
        });
      } else {
        rows.push({
          ...base,
          classification: 'skip',
          reason: 'The managed occurrence and source are unchanged.',
          managementAction: 'metadata-only',
        });
      }
      continue;
    }

    if (!existingOccurrence) {
      rows.push({
        ...base,
        classification: 'update',
        reason:
          sourceStatus === 'cancelled'
            ? 'Persist the cancelled source occurrence without creating a Calendar Event.'
            : 'Persist the excluded source occurrence without creating a Calendar Event.',
        managementAction: 'metadata-only',
      });
      continue;
    }
    if (existingOccurrence.managementStatus !== 'materialized' || !existingEvent) {
      rows.push({
        ...base,
        classification: sourceChanged ? 'update' : 'skip',
        reason: 'Update the persisted occurrence tombstone without writing a Calendar Event.',
        managementAction: 'metadata-only',
      });
      continue;
    }
    if (locallyEdited) {
      const decision = input.decisions[occurrenceIdentityKey];
      if (!decision || !['remove', 'detach'].includes(decision.action)) {
        rows.push(
          rowForReview(
            base,
            sourceStatus === 'absent'
              ? 'The source removed a locally edited occurrence. Choose whether to delete it or keep it as a manual Event.'
              : 'The source excluded or cancelled a locally edited occurrence. Choose whether to delete it or keep it as a manual Event.',
          ),
        );
      } else if (decision.action === 'remove') {
        rows.push({
          ...base,
          classification: 'remove',
          reason: 'Remove the locally edited Event as explicitly confirmed.',
          managementAction: 'remove-materialized',
        });
      } else {
        rows.push({
          ...base,
          classification: 'update',
          reason: 'Keep the local Event and detach it from recurrence management.',
          managementAction: 'detach',
        });
      }
      continue;
    }
    rows.push({
      ...base,
      classification: 'remove',
      reason:
        sourceStatus === 'absent'
          ? 'The source no longer contains this occurrence.'
          : sourceStatus === 'cancelled'
            ? 'The source cancelled this occurrence.'
            : 'The source excluded this occurrence.',
      managementAction: 'remove-materialized',
    });
  }

  return rows.sort(
    (first, second) =>
      first.eventOrdinal - second.eventOrdinal ||
      first.occurrenceKey.localeCompare(second.occurrenceKey),
  );
}
