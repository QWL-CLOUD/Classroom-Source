# Phase 3I-0.5J.3 — ICS Recurrence and Exceptions

## Purpose

This phase extends Calendar Events Import so a reviewed ICS import can safely materialize supported recurring events as ordinary Classroom Calendar Events, reconcile later imports, preserve user changes, and remain globally undoable and redoable.

Calendar continues to read and render discrete `CalendarEvent` records. Recurrence rules are import-time source data rather than a new Calendar runtime domain.

## Storage and compatibility

- Classroom database version: **16**
- Classroom backup version: **16**
- Previous backup restore remains supported through the existing migration path.
- Existing non-recurring Calendar Events and Phase 3I-0.5J.2 imports are not rewritten.

Two metadata tables support safe re-import:

- `calendarEventImportSeries` stores the imported series identity, source fingerprint, School Year, timezone form, and current source authority.
- `calendarEventImportOccurrences` stores each source occurrence identity, materialized Event link when present, last imported fingerprint, and management state such as materialized, suppressed, detached, or source-removed.

The metadata does not replace Calendar Events. It records import ownership and reconciliation history.

## Supported recurrence forms

The reviewed import supports:

- `DAILY`, `WEEKLY`, `MONTHLY`, and `YEARLY`
- `INTERVAL`
- either `COUNT` or `UNTIL`
- `BYDAY`, including supported monthly and yearly ordinal weekdays
- `BYMONTHDAY`
- `BYMONTH`
- `BYSETPOS`
- `WKST`
- `RDATE` additions
- `EXDATE` exclusions
- one-off moved overrides using `RECURRENCE-ID`
- one-off cancelled overrides using `STATUS:CANCELLED`
- all-day, UTC, floating, and TZID wall-time forms

TZID imports require the source calendar to include a matching `VTIMEZONE`. Classroom validates the timezone definition and preserves the source wall-time representation; it does not add a separate global timezone database.

## Explicitly blocked forms

The import blocks rather than approximates:

- `SECONDLY`, `MINUTELY`, or `HOURLY`
- `BYSECOND`, `BYMINUTE`, or `BYHOUR`
- `BYYEARDAY` or `BYWEEKNO`
- RDATE periods
- `RANGE=THISANDFUTURE`
- master `STATUS:CANCELLED`
- calendar-level `METHOD:CANCEL`
- DURATION-only events
- unresolved TZIDs
- rules containing both `COUNT` and `UNTIL`
- more than one RRULE for a VEVENT
- occurrences outside the selected School Year
- recurrence sets exceeding the review or expansion limits

## Expansion and identity

The recurrence set is built from the master `DTSTART`, supported `RRULE` values, and `RDATE`, then filtered by `EXDATE`. Overrides are applied by canonical recurrence identity. A moved override retains the original recurrence identity while materializing the replacement date and time. A cancelled override remains represented in import metadata without creating a Calendar Event.

Occurrence identity is deterministic from the selected School Year, ICS UID, original recurrence identity, and time form. Event identity and import metadata remain stable across repeated previews and commits.

## Re-import reconciliation

A file has reconciliation authority only for UIDs actually present in that file. Omitting an unrelated series from a later file does not remove it.

For represented UIDs, preview distinguishes:

- new source occurrence
- unchanged managed occurrence
- source update
- source removal
- EXDATE exclusion
- cancelled override
- locally edited Event
- locally deleted Event
- occurrence previously suppressed by the user
- occurrence detached from import management

Potentially destructive or ambiguous changes require explicit review. Users can keep a local Event and detach it, continue suppressing a previously deleted occurrence, restore source management, accept a source update, or approve a source removal. Exact re-imports remain no-write except for any explicitly reviewed metadata transition.

## Atomic commit and global history

A Calendar recurrence import commit is one transaction covering:

- Calendar Events
- Calendar Event categories and assignments when required
- import series metadata
- import occurrence metadata
- Import Run history
- global change log

One global Undo reverses the entire import, including metadata. Redo restores it as the same logical action. Schedule Blocks, Schedule Exceptions, Sessions, and Reminders are outside this transaction.

## Safety limits

Expansion is bounded by:

- selected School Year dates
- a per-series generated-occurrence cap
- a per-file reviewed-occurrence cap
- a deterministic iteration cap for sparse or malformed rules

The preview is blocked before commit when a limit is exceeded.

## Validation and manual QA

Automated coverage includes:

- each supported frequency
- RDATE and EXDATE precedence
- moved and cancelled overrides
- daylight-saving wall-time preservation
- local edit and deletion conflict handling
- suppression and detachment
- source shortening and removals
- partial-file UID authority
- database and backup version migration
- atomic Undo and Redo
- recurrence Import Center accessibility and deep-link behavior

Manual QA should verify preview no-write behavior, recurring Event placement, exception handling, conflict decisions, re-import stability, source-removal review, global Undo and Redo, backup export/restore, and unchanged Schedule/Session/Reminder data.
