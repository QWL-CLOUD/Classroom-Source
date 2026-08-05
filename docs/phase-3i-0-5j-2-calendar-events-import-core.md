# Phase 3I-0.5J.2 — Calendar Events Import Core

## Purpose

Calendar Events Import adds a reviewed, transactional path for bringing school-wide dated Events into the existing Calendar without creating Schedule Blocks, Sessions, Schedule Exceptions, or Reminders.

The canonical entry point remains `#/import?type=calendar-events`. Calendar and School Years expose contextual links to that same Import Center workspace.

## Supported sources

- `.ics` iCalendar files containing independent, non-recurring `VEVENT` components.
- `.csv` worksheets.
- `.xlsx` workbooks.

CSV/XLSX templates use these fields:

- Event ID / external key
- Title
- Description
- Location
- Start date
- End date (inclusive)
- Start time
- End time
- Time zone
- Calendar Event Type
- External source namespace

## Calendar and identity semantics

Every committed Event belongs to one School Year. Dates must remain within that School Year's inclusive boundaries.

ICS identity is:

```text
calendar-event\0ics\0<UID preserving case>
```

Tabular identity is:

```text
calendar-event\0tabular\0<normalized source namespace>\0<external key preserving case>
```

An exact identity in the selected School Year may update the existing imported Event. An identity already owned by another School Year is blocked. Similar title/date/time values never overwrite automatically: the user must explicitly create a separate Event, skip the row, or select a manual Event to update.

## ICS constraints

The parser unfolds folded lines, reads escaped text, preserves UTC/TZID/floating wall-time form in the Event's `timeZone` field, and converts all-day `DTEND` from RFC 5545's exclusive date to Classroom's inclusive `endDate`.

The following are blocked rather than expanded or guessed:

- `RRULE`, `RDATE`, `EXDATE`, or `RECURRENCE-ID`
- `DURATION` without an explicit supported end
- `STATUS:CANCELLED` or calendar `METHOD:CANCEL`
- mixed all-day/timed start and end values
- mismatched UTC, TZID, or floating forms
- non-zero seconds that Classroom cannot preserve

`VALARM` is ignored with a warning; it never creates a Reminder. `STATUS:TENTATIVE` requires explicit acknowledgement before commit.

## Classification

Calendar Event Type uses the existing `calendar-event-type` category family, aliases, and classification mapping presets. Unknown values require review. Unlike Library Catalog imports, Calendar Events do not offer a generic-tag fallback.

## Commit and history

A successful import commits one IndexedDB transaction covering:

- `schoolYears` read validation
- `calendarEvents`
- `categoryValues`
- `categoryAssignments`
- `classificationMappingPresets`
- `importRuns`
- `changeLog`

The import participates in the existing persistent global Undo/Redo system as one change. A stale preview is rejected if the School Year, an expected Event, relevant assignments, category values, mapping presets, source fingerprint, or source kind changes before commit.

DB schema and Backup format remain v15. Existing v14/v15 restore compatibility is retained.

## Explicit non-goals

This phase does not:

- expand recurring calendars
- import recurrence exceptions
- create or alter Schedule Blocks
- create or alter Sessions
- create Schedule Exceptions
- create Reminders from alarms
- perform UTC-to-local or TZID conversion
- synchronize with a remote calendar provider
- add a second Calendar import route
