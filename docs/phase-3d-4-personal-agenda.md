# Phase 3D-4 — Personal Agenda

Personal Agenda is a real-time aggregation view over existing Classroom records. It does not add an
Agenda entity or IndexedDB store.

## Included sources

- Active Tasks with a scheduled date or due date
- Waiting Tasks
- Active learner-notice follow-up Tasks without a scheduled or due date
- Active Reminders
- Calendar Events classified as Personal, Private, or Home
- Active Learner Notices

A source record appears only once in its most urgent applicable Agenda section. A Task that is both
scheduled and due on the selected date remains one Task item. A Reminder remains a separate source
record even when it points to that Task.

## Stable sections

1. **Overdue** — past active Task deadlines, active Reminders, and unresolved date-specific Notices
2. **Today** — scheduled or due Tasks, active Reminders, current personal events, ongoing support,
   learner services, and date-specific Notices for the selected date
3. **Upcoming** — future dated Tasks, Reminders, personal events, and date-specific Notices
4. **Waiting** — Tasks in the Waiting lifecycle state
5. **Unscheduled follow-up** — active Tasks explicitly created from Learner Notices without a
   scheduled or due date

Completed and Cancelled Tasks, Dismissed Reminders, Resolved or Archived Notices, non-personal
Calendar Events, and ordinary unscheduled Tasks remain outside Agenda.

## Mutations

Agenda actions call the existing source mutation services:

- Complete or Restore a Task
- Dismiss or Snooze a Reminder
- Resolve a Learner Notice

These actions retain the existing Zod validation, Dexie transaction, compound change log, and global
Undo/Redo behavior. Calendar Events link back to Calendar for management.

## Today summary

Today renders a compact Agenda summary for the same selected date and links to the full Agenda route.
The summary and full route use the same read model.

## Schema impact

None. Phase 3D-4 adds a pure read model, route, and source-record actions. IndexedDB remains schema
version 3.
