# Phase 3D-2 — Reminder Foundation

## Scope

Phase 3D-2 introduces a real `Reminder` record linked by stable source type and source ID. A Reminder
is not a duplicate Task, Session, Calendar Event, or Learner Notice, and dismissing it never changes
or completes its source record.

Implemented source types:

- Task
- Session occurrence
- Calendar Event
- Learner Notice is reserved in the schema and command model; creation remains disabled until Phase
  3D-3 provides the source record.

Each supported source may own multiple Reminder records. Existing Task cards, Calendar Event editors,
and saved Session editors expose one shared Reminder panel. Today reads only active Reminder records
for the selected date and no longer treats every dated Calendar Event as a reminder.

Lifecycle actions:

- Create
- Edit date, time, and optional note
- Dismiss
- Snooze to a new date/time
- Restore a dismissed Reminder
- Delete

Every action is Zod-validated, committed in a Dexie transaction, recorded in the compound change log,
and available through global Undo/Redo.

## Database change

The new `reminders` table requires Dexie schema version 2. The upgrade preserves every v1 table and
record and adds indexes for source identity, status, date, minute, and update time. The Task table also
gains a `scheduledDate` index while retaining all Task records.

## Locked behavior

- Dismiss never completes a Task or changes the source record.
- Snooze changes only the Reminder schedule and keeps the Reminder active.
- Multiple Reminders may point to the same source.
- Today shows active Reminders whose `remindDate` equals the selected local date.
- A missing source is displayed as unavailable instead of fabricating or copying the source entity.

## Non-goals

- Browser, operating-system, email, or SMS notifications
- Repeating Reminder rules
- Personal Agenda aggregation
- Learner Notice creation or support workflows
- Automatic Task creation
- Automatic source-deletion policy; unavailable sources remain explicitly identifiable until a later
  lifecycle phase defines reassignment or cleanup behavior
