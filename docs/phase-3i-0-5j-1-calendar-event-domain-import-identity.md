# Phase 3I-0.5J.1 — Calendar Event Domain & Import Identity Foundation

## Baseline

- Audited `main`: `827dd9b33845a868a1d608a73741dd277421dd30`
- Database before this phase: v14
- Backup format before this phase: v14

## Purpose

This phase prepares canonical Calendar Events for a later reviewed Calendar Events Import. It does not add a Calendar importer, ICS parsing, recurrence expansion, or Schedule Exception automation.

Calendar Events, Schedule Blocks, Schedule Exceptions, and Sessions remain separate domains.

## Domain changes

`CalendarEvent` now supports optional, backward-compatible fields:

- `schoolYearId`
- `location`
- `timeZone`
- `externalSource`
- `externalKey`
- `importIdentityKey`
- `lastImportRunId`

Legacy manual Events without these fields remain valid. The migration does not guess School Year ownership or provenance.

Imported records in the later J.2 phase will require a selected School Year and stable external identity. Title equality will never establish update identity.

## Calendar Event Types

Categories & Labels now owns the canonical single-select family:

```text
calendar-event-type
Calendar Event Types
```

Assignments target `calendar-event` records. The Event's existing `category` string remains as a backward-compatible display snapshot:

- assigning a canonical Event Type updates the snapshot;
- renaming or merging the assigned value updates the snapshot atomically;
- legacy Events without assignments keep their existing free-text category;
- aliases are never stored as the final category value.

## Manual Calendar Event editing

The Calendar Event editor supports:

- optional School Year ownership;
- one canonical Calendar Event Type;
- retained legacy free-text category when no canonical type is assigned;
- location;
- time zone;
- same-day and overnight timed intervals.

Create, update, and delete operations commit Calendar Event and category-assignment changes in one transaction and one global Undo/Redo action.

Archived School Years and Event Types may remain visible when already assigned, but cannot be newly assigned.

## Command compatibility

New Calendar Event commands serialize operation lists for:

- `calendarEvents`
- `categoryAssignments`

The parser remains compatible with existing single-record Calendar Event commands, preserving old persistent Undo/Redo history.

Category commands can also carry Calendar Event snapshot operations so rename, merge, assign, and unassign remain atomic and undoable.

## School Year lifecycle

School Year dependency checks now count linked Calendar Events. A School Year with Calendar Events can be archived but cannot be destructively deleted until the Events are removed or reassigned.

## Database and backup

- Database schema: v15
- Backup schema: v15
- Unique Calendar Event index: `&importIdentityKey`
- Schema v14 backups remain restorable.
- Existing Events remain unassigned rather than receiving guessed ownership.
- Multiple manual Events without an import identity remain allowed.

## Scope correction

The repository-backed audit initially estimated 29 paths. Implementation validation found two existing Playwright assertions that explicitly expected backup schema v14:

- `tests/e2e/backup-recovery-foundation.spec.ts`
- `tests/e2e/assessment-evidence-domain.spec.ts`

They must change to v15 or the full suite would fail. The corrected locked implementation scope is therefore:

```text
31 paths
29 modified
2 new
```

This correction adds no product behavior beyond the approved DB/Backup v15 foundation.

## Explicit non-goals

- Import Center Calendar option
- ICS parsing
- CSV/XLSX Calendar import
- duplicate review
- recurrence or exception expansion
- automatic Schedule Exceptions
- automatic cancellation of Schedule Blocks or Sessions
- cloud/calendar synchronization

## Next phase

After this foundation is merged, Phase 3I-0.5J.2 should receive a fresh repository-backed audit for:

- non-recurring ICS VEVENTs;
- CSV and XLSX;
- selected destination School Year;
- Event Type resolution and mapping reuse;
- reviewed create/update/skip/blocked decisions;
- no-write preview;
- atomic ImportRun and global Undo/Redo.
