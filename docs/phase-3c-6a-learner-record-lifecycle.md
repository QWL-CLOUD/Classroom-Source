# Phase 3C-6A — Learner Record Lifecycle

## Scope

- Edit Class, Group, and Individual profile fields without replacing their stable IDs.
- Archive and restore learner contexts.
- Keep archived contexts available with historical Plans, Sessions, and Lesson Series.
- Exclude archived contexts from new-Plan selection and reject direct new Plan/Session mutations until restoration.
- Preview linked-record counts before deletion.
- Delete only a context with no memberships, Schedule Blocks, Calendar Events, Lesson Series, Plans, Sessions, or Tasks.
- Route edit, archive, restore, and safe delete through Zod validation, Dexie transactions, compound change-log commands, and global Undo/Redo.

## Locked safety behavior

Deletion never cascades. A context with any operational or historical link is blocked from deletion and should be archived instead. Existing records keep the same `contextId`, so renaming or lifecycle changes do not rewrite historical ownership.

## Implementation notes

- No database version change is required because `LearnerContext.status` and its Dexie index already exist.
- `learner-context.*` commands support `learnerContexts` and `contextMemberships` so the global edit-history registry can replay context lifecycle operations transactionally.
- Learners loads active and archived contexts for the active school year, while Planning continues to offer only active contexts for new work.
- The Learners route exposes Active and Archived navigation, profile editing, delete-impact counts, and history-preserving archive/restore actions.

## Non-goals

- Creating learner contexts manually.
- Merging duplicates.
- Bulk reassignment of Plans, Sessions, or history.
- SIS/roster integration.
- Learner Support or Notice records.
- Deleting linked teaching history.
