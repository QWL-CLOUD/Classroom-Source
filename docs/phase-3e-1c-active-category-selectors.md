# Phase 3E-1C — Active Category Selectors & Final Closure

## Purpose

Connect the managed-vocabulary foundation to the records that can use it now,
without copying category names into source records.

## Integrated families

- Lesson Plans: Focus Tags, Purpose Tags, Theme Tags.
- Tasks: Task Labels.
- Learner Notices: Support Areas.

Template Formats and Resource Formats remain managed but unassigned until the
Template and Library phases.

## Assignment behavior

- Records link to stable category-value IDs through `categoryAssignments`.
- New records begin with the active family default when one exists.
- Editing a record without changing its category draft preserves its exact
  assignments.
- Changing a family default does not rewrite existing records.
- Renaming a value changes the displayed name everywhere without changing the
  assignment ID or category-value ID.
- Archived values are excluded from new selection.
- An archived value already assigned to a historical record remains visible
  and can be removed or replaced.
- Merged values cannot be newly assigned or retained.

## Transaction and history contract

Planning, Task, and Learner Notice saves build category-assignment operations
inside the same command as the source-record mutation. The same Dexie
transaction writes the record, assignments, and change log. Global Undo/Redo
therefore restores both the source record and its exact assignments.

Deleting a Lesson Plan, Task, or Learner Notice also deletes its assignments in
the same command; Undo restores the original assignment records.

A Learner Notice that creates a follow-up Task also applies the active Task
Label default inside the same Learner Notice compound command.

## UI contract

- Selectors show only supported current families for the record type.
- Active values are keyboard-operable checkboxes or radios.
- Defaults are identified but remain editable before save.
- Existing archived values are marked `Archived` and remain removable.
- Empty families provide a direct link to Categories & Labels management.
- Selector layouts must not create mobile horizontal overflow.

## Explicit non-goals

- Library, Template, Standard, Activity, Resource, or Assessment CRUD.
- Schedule Block or Calendar Event free-text category migration.
- Automatic conversion of historical free-text tags.
- AI categorization.
- Duplicating Schedule Parent Blocks as categories.
- Another Learners, Calendar, navigation, or School Year redesign.
