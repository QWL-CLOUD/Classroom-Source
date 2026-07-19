# Phase 3D-3 — Learner Support & Notices

## Scope

Phase 3D-3 introduces one shared `LearnerNotice` record for learner-facing support work. The same
record appears in the selected Learner context and in Today; Today does not create a second copy.

Record types:

- Ongoing Support
- Date-specific Notice
- Learner Service

Lifecycle actions:

- Create
- Edit
- Resolve
- Reopen
- Archive
- Safe delete when no Reminder or follow-up Task remains linked

Learner pages provide Active and History views. Today quick add creates a date-specific Notice for
the selected date. Ongoing Support and Learner Service records remain visible in Today while active;
date-specific Notices appear only on their notice date.

Every mutation is Zod-validated, committed in a Dexie transaction, recorded in the compound change
log, and available through global Undo/Redo.

## Optional follow-up Task

Creating a Notice may explicitly create one separate follow-up Task. The Task keeps its own lifecycle
and stores the source relationship using `linkedEntityType: learner-notice` and the Notice ID. Notice
creation plus the optional Task is one compound, undoable operation. No Task is created by default.

A Notice with a linked follow-up Task cannot be deleted until the link is removed; Archive remains the
safe historical action.

## Reminder integration

Phase 3D-2 reserved `learner-notice` as a Reminder source. Phase 3D-3 activates that source:

- A Notice may have multiple Reminder records.
- Dismiss, Snooze, Restore, and Delete affect only the Reminder.
- Reminder source links resolve to the original Learner Notice and its Learner context.
- A Notice with linked Reminders cannot be deleted.

## Database change

Dexie schema version 3 adds the `learnerNotices` store with indexes for context, type, status, notice
date, and update time. Existing version 1 and version 2 records are preserved.

## Locked behavior

- Class, Group, and Individual links use stable context IDs.
- Archived contexts retain historical Notice records but cannot receive new ones.
- Today and Learners read the same Notice record.
- Resolving a Notice does not complete its linked Task or dismiss its Reminder.
- Notice deletion never cascades into Tasks or Reminders.
- Missing sources remain identifiable rather than being silently copied or orphaned.

## Non-goals

- Personal Agenda aggregation
- Browser, operating-system, email, or SMS notifications
- Automatic Task creation
- Medical, IEP, SIS, or formal student-record workflows
- Attachments or bulk import
- Reflection, Memory, or Teaching Insights
