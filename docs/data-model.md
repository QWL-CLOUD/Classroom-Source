# Data Model Foundation

The Phase 0 database includes stable tables for school years, learner contexts, recurring schedule
blocks, date exceptions, calendar events, lesson plans, session occurrences, tasks, reminders, learner notices, migration runs,
quarantine records, command history, and app settings.

The critical distinction is:

- `ScheduleBlock`: recurring time structure
- `LessonPlan`: undated instructional content
- `SessionOccurrence`: a lesson scheduled on a specific local date and time

## Lesson series and ordering

`LessonSeries` groups related `LessonPlan` records inside one Class, Group, or Individual context.
The series does not copy lesson content or create Session records. Each member plan stores the
existing optional `seriesId` and zero-based `sequence` fields. New members append to the series;
Move earlier and Move later normalize the order transactionally.

Creating a series while saving a plan, changing a plan's series, deleting a plan, and reordering a
series all write one compound Planning command. Global Undo/Redo therefore restores the series
record and every affected sequence together. The existing `lessonSeries` table and indexed
`LessonPlan.seriesId` field are sufficient, so Lesson Series work does not change the Dexie version.

## Lesson Series lifecycle

A Series has an `active` or `archived` lifecycle state. Existing records without this field parse as
active. Archived Series remain attached to their existing Plans and Sessions, but they are excluded
from new Plan assignment choices until restored.

Deleting a Series deletes only the container record. Every linked Plan is preserved and becomes
ungrouped by clearing `seriesId` and `sequence`. Session occurrences, completed teaching history,
and future Session-linked Reflection or Memory records are not touched. The Series deletion and all
Plan detachments commit as one compound Planning command, so one Undo restores the Series and every
original sequence.

## Lesson content and inheritance

`LessonPlan` owns reusable instructional content:

- learning target
- plan notes
- ordered lesson-flow steps
- each step's phase, duration, directions, and teacher notes

A `SessionOccurrence` normally stores no duplicate teaching content. It resolves content from its
linked `LessonPlan`, so plan edits continue to appear in the Session. When a teacher customizes one
occurrence, the Session stores a `contentOverride` snapshot. That override remains independent until
**Use plan content** removes it and restores live inheritance.

Lesson Flow is stored inside the existing records. It does not add an IndexedDB table or require a
Dexie schema-version change because no new index is needed.

A Friday block is not a special rendering branch. It is a normal schedule block with `weekdays: [5]`.
All local dates use `YYYY-MM-DD`; clock values are integer minutes after midnight.

## Lesson Series Bump foundation

Phase 3C-3B keeps Bump metadata out of the database schema. A Bump is computed from existing
Lesson Series order, scheduled Session occurrences, one bump-enabled Schedule Block, and its dated
Schedule Exceptions. The dry-run preview shifts each scheduled Session from the selected lesson
onward to that Session's next valid occurrence. Cancelled dates are skipped; added and modified
occurrences supply their effective date and time.

The commit revalidates the preview inside one Dexie transaction, refuses stale previews or occupied
target Schedule Block dates, and stores all Session replacements in one Planning change-log command.
Global Undo/Redo therefore restores or reapplies the entire shift atomically. Cross-context,
cross-block, parent-subtree, and automatic collision cascading remain out of scope.

## Reminder foundation

`Reminder` is an independent source-linked record with `sourceType`, `sourceId`, local reminder date
and minute, lifecycle status, and optional note. It does not copy or replace its Task, Session,
Calendar Event, or future Learner Notice source. Multiple Reminder records may share the same source.

Dismiss and Snooze mutate only the Reminder. Today queries active Reminder records by `remindDate`;
Calendar Events are no longer projected into a reminder list. Adding the `reminders` table and its
source/date indexes upgrades Dexie to schema version 2 while preserving v1 records.

## Learner Support & Notices

`LearnerNotice` is one shared source record linked to a stable Class, Group, or Individual context.
Its type is Ongoing Support, Date-specific Notice, or Learner Service; its lifecycle state is Active,
Resolved, or Archived. Today and Learners read the same record. Active Ongoing Support and Learner
Service records appear on every selected Today date, while a Date-specific Notice appears only on
its `noticeDate`.

Creating a Notice may explicitly create a separate follow-up Task with a stable source link. The
Notice and optional Task commit as one compound command, but their later lifecycles remain
independent. Reminder records may also use the Notice as a source. Resolve, Archive, and Reminder
actions never complete or delete linked Tasks. Safe Notice deletion is blocked while any Reminder or
follow-up Task remains linked.

The `learnerNotices` table and indexes for context, type, status, date, and update time upgrade Dexie
to schema version 3 while preserving version 1 and version 2 records.

## Personal Agenda

Personal Agenda is a pure read model over Tasks, Reminders, Calendar Events, Learner Notices, learner
contexts, Sessions, and Lesson Plans. It assigns each eligible source record to one stable section:
Overdue, Today, Upcoming, Waiting, or Unscheduled follow-up. The view never writes an Agenda row or
creates a duplicate source entity.

Task, Reminder, and Learner Notice actions from Agenda call their existing transactional mutation
services, so global Undo/Redo continues to operate on the original record. Phase 3D-4 does not change
the Dexie schema; the database remains at version 3.

## Managed Categories & Labels foundation

Phase 3E-1A upgrades Dexie to schema version 4 with `categoryValues` and
`categoryAssignments`. The seven family definitions remain code-owned and stable; users manage values
inside those families rather than creating parallel family stores.

A `CategoryValue` owns stable identity, normalized name and aliases, active ordering, optional default
and presentation keys, plus active/archive/merge lifecycle metadata. Rename retains the previous name
as an alias. Archive hides a value from new selection without breaking historical display. Merge
retains provenance, moves references, and resolves former names to the surviving stable value.

A `CategoryAssignment` is a relationship to an existing source record. It does not duplicate Lesson
Plans, Tasks, Learner Notices, future Templates, or future Library items. Usage counts are derived from
these assignments, while incoming merged-history references are tracked separately to protect alias
resolution. All category mutations are represented by compound category commands and are part of
global Undo/Redo.

No existing `ScheduleBlock.category` or `CalendarEvent.category` text is automatically converted.
Schedule Parent Blocks remain Schedule records rather than managed categories.

## Canonical Assessment Evidence

Phase 3I-0 upgrades Dexie to schema version 12 with the `assessmentEvidence` table. Every
`AssessmentEvidenceRecord` belongs to one canonical `StudentRecord` and one school year. Class,
Group, Individual, Lesson Plan, Session, Library Assessment, and Standard references are optional
historical sources rather than ownership records.

Evidence uses a discriminated result type. A record contains exactly one of numeric or categorical
score data, a proficiency level within an identified scale, or an anecdotal observation. The domain
does not persist a percentage, average, mastery judgment, Student ranking, or final grade. Different
proficiency scales remain independent.

When a current optional source is linked, the mutation service captures a lightweight readable
snapshot. Deleting or archiving a context, Plan, Session, Assessment, or Standard does not delete or
rewrite the evidence. The source ID and snapshot remain available for later progress reports and
exports. Unchanged dangling optional references can still be edited safely after restore or source
cleanup.

Create, edit, archive, and restore are transactional `assessment-evidence.*` commands in the global
persistent Undo/Redo journal. User-facing permanent deletion is not introduced in Phase 3I-0.
School years containing evidence cannot be permanently deleted. Backup schema v12 exports the full
evidence table; schema v10 and v11 backups restore it empty, while malformed evidence records are
quarantined atomically with the rest of Restore.

## Canonical Import Center foundation

Phase 3I-0.5A upgrades Dexie and the backup schema to version 13. The new `importRuns` table is the
canonical history for future roster, Standards, Activity, Resource, and Assessment imports. It stores
source type, optional source/worksheet labels, optional roster context, complete row classification
counts, and the commit timestamp. Existing `standardImportBatches` remain readable legacy history;
they are not destructively migrated in this phase.

Library Catalog records may now retain optional external source/key provenance, a readable source
reference, a unique normalized `importIdentityKey`, and `lastImportRunId`. A stable import identity
requires both an external source and key; title equality alone never establishes update ownership.

The shared import source layer normalizes CSV, XLSX, JSON, and pasted tables without writing. Generic
preview rows use Create, Update, Skip, Review, and Blocked classifications. The new
`import-center.*` command domain can atomically restore import history, Catalog records, category
assignments, and Standard alignments through persistent global Undo/Redo.

Backup v13 includes canonical import history. Backups from database schemas v10, v11, and v12 remain
restorable, with tables introduced by later schemas safely initialized empty. No new Import Center UI,
file attachment storage, or catalog import workflow is introduced in 3I-0.5A.

## Phase 3I-0.5C Activity import extension

Activities remain `libraryItems` with `catalogType: "activity"`; DB v13 and the existing unique
`importIdentityKey` index are unchanged. Activity typed fields additionally allow optional text-only
`materials` (maximum 5,000 characters) and `notes` (maximum 10,000 characters).

A strong imported Activity identity is the normalized tuple `(externalSource, externalKey)` with an
Activity namespace prefix. Title equality is only a probable-duplicate review signal and cannot
cause automatic overwrite. Imported Purpose and Focus values use canonical `categoryValues` and
`categoryAssignments`, scoped to Activity catalog records. New or restored values, Activity records,
assignments, `importRuns`, and one compound `changeLog` entry are committed atomically and share one
global Undo/Redo operation.

## Database v14: classification mapping presets

Schema v14 adds `classificationMappingPresets`. A preset maps normalized imported source text in one
managed category family to a stable `CategoryValue`. Presets are reusable import assistance, not a
new instructional-content domain. They participate in reviewed imports, Backup & Recovery, and
persistent Undo/Redo without changing the ownership of the imported source records.

## Database v15: Calendar Event import identity

Schema v15 extends `CalendarEvent` with School Year ownership and a unique imported identity. The
canonical Calendar Events Import supports reviewed CSV, XLSX, and non-recurring ICS records. A
strong imported identity, not title equality, controls automatic update ownership. Imported Events,
category assignments, mapping presets, ImportRun history, and the change-log command commit in one
transaction and undo together.

Portable backup v15 includes the Calendar Event identity fields. Older supported backups restore
with the new fields absent until records are subsequently imported or edited.

## Database v16: ICS recurrence ownership and reconciliation

Schema v16 adds two metadata tables while continuing to materialize Calendar occurrences as ordinary
`CalendarEvent` records:

- `calendarEventImportSeries` owns one imported recurring series within one School Year and stores
  the source identity and most recent imported series fingerprint.
- `calendarEventImportOccurrences` records each source occurrence identity, materialized Event link,
  imported fingerprint, management state, source status, and suppression/detachment decisions.

The recurrence engine supports the approved DAILY, WEEKLY, MONTHLY, and YEARLY rule subset plus
INTERVAL, COUNT or UNTIL, BYDAY, BYMONTHDAY, BYMONTH, BYSETPOS, WKST, RDATE, EXDATE, and single moved
or cancelled occurrence overrides. Unsupported or ambiguous rules are blocked before writes.

Re-import reconciliation distinguishes source changes from local Event edits or deletion. A user can
restore a deleted occurrence, keep it suppressed, accept a source removal, or detach a locally kept
Event from import ownership. Events, series metadata, occurrence metadata, ImportRun history, and
change-log data remain one atomic command for commit and global Undo/Redo.

School Years with recurrence ownership cannot be permanently deleted even when every materialized
Calendar Event has been cancelled, excluded, suppressed, or detached. This prevents orphaned series
and occurrence metadata.

Portable backup v16 includes both recurrence tables. Supported v10–v15 backups restore them empty.
The Personal Pilot Closure does not change the database or backup schema beyond v16.
