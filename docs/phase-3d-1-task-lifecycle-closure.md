# Phase 3D-1 — Task Lifecycle Closure

## Scope

- Extends the shared Task record to Active, Waiting, Completed, and Cancelled.
- Separates Scheduled date/time (planned work) from Due date/time (deadline).
- Adds create, edit, complete, reopen, move-to-Waiting, cancel, restore, and delete workflows.
- Keeps Today To-do and Tasks synchronized through the same IndexedDB Task record.
- Routes all Task mutations through Zod validation, Dexie transactions, compound change logs, and global Undo/Redo.
- Preserves stable optional learner-context links and prevents new links to archived contexts.

## Today rule

Today is a date-specific action view. It shows only Active tasks whose `scheduledDate` equals the selected date.

- An unscheduled Task remains in the Tasks Active section.
- A Due date by itself does not place a Task on Today because a deadline is not a planned work date.
- Waiting, Completed, and Cancelled Tasks do not appear in Today To-do.
- Adding a Task from Today sets `scheduledDate` to the selected date.

Deadlines, overdue aggregation, Reminder records, and Personal Agenda remain later phases.

## Lifecycle rules

- Active → Completed, Waiting, or Cancelled.
- Waiting → Completed, Active (Restore), or Cancelled.
- Completed → Active (Reopen).
- Cancelled → Active (Restore).
- Delete is explicit and globally undoable/redoable.
- Status-specific timestamps are retained only while the Task is in that status.

## Data compatibility

No IndexedDB version change is required. New Task fields are optional, and the existing `status` index accepts the expanded enum. Existing Active and Completed Task records remain valid.

## Non-goals

- Reminder records, Snooze, or Dismiss.
- Personal Agenda and overdue aggregation.
- Learner Support or Notice records.
- Automatic conversion from Sessions, Calendar Events, or Notices.
- Bulk Task operations or drag-and-drop ordering.
