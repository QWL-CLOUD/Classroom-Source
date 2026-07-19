# Data Model Foundation

The Phase 0 database includes stable tables for school years, learner contexts, recurring schedule
blocks, date exceptions, calendar events, lesson plans, session occurrences, tasks, reminders, migration runs,
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
