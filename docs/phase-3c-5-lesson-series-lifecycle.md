# Phase 3C-5 — Lesson Series Lifecycle Closure

## Scope

- Manage Lesson Series from Learners → Planning → Series.
- Rename a Series without changing linked Plans or Sessions.
- Archive and restore a Series.
- Archived Series remain visible on existing Plans but cannot accept new Plan assignments.
- Delete only the Series container.
- Deleting a Series detaches linked Plans by clearing `seriesId` and `sequence`.
- Scheduled and completed Session occurrences remain unchanged.
- Completed teaching history and future Session-linked records remain intact.
- Every mutation is one validated Dexie transaction and one compound global Undo/Redo command.

## Non-goals

- Delete all Plans or Sessions in a Series.
- Merge Series.
- Move a Series to another learner context.
- Duplicate a Series.
- Add Templates or Library records.

## Acceptance

- Series cards show linked Plan, Unscheduled, Scheduled, and Completed counts.
- Rename updates Series labels across Learners and Planning.
- Archive removes the Series from new assignment choices; Restore returns it.
- Delete confirmation explicitly states that Plans become ungrouped and teaching history remains.
- Delete does not remove any Session occurrence.
- Undo restores the Series, membership, and original sequence values in one action.
- Redo detaches the Plans again without changing Sessions.
