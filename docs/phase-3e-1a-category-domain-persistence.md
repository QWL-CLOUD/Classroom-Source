# Phase 3E-1A — Categories & Labels Domain and Persistence Foundation

Phase 3E-1A establishes the managed-vocabulary architecture before any Categories management UI,
Library catalog, or Lesson Template workflow is added.

## Locked family registry

Category families are code-owned product vocabulary rather than user-created database records:

- Template Formats
- Focus Tags
- Purpose Tags
- Theme Tags
- Resource Formats
- Task Labels
- Support Areas

Each family has a stable ID, label, selection mode, supported target type, and current/future assignment
availability. Schedule Parent Blocks remain outside this registry and continue to be managed by
Schedule.

## Stable values and aliases

`CategoryValue` records use a stable ID. Rename changes only presentation text and retains the old
name as an alias. Links therefore remain intact, while old import names remain resolvable.

A value stores:

- family ID and stable value ID;
- display and normalized name;
- display and normalized aliases;
- explicit active-family order;
- optional default, color key, and icon key;
- `active`, `archived`, or `merged` lifecycle state;
- merge target and lifecycle timestamps where applicable.

Archived values disappear from new selectors but remain available for historical display. Merged
values remain as provenance records and resolve to their surviving target.

## Assignments and usage

`CategoryAssignment` is a relationship record. It points from one Category Value to an existing
source record; it never copies a Lesson Plan, Task, Learner Notice, future Template, or future Library
item.

Current assignment targets are:

- Focus, Purpose, and Theme Tags → Lesson Plans;
- Task Labels → Tasks;
- Support Areas → Learner Notices.

Template Formats and Resource Formats are manageable vocabulary in 3E-1, but their assignments remain
reserved until the Template and Library source records exist.

Usage count is derived from assignment records, including a breakdown by source entity type. The read model also reports incoming merged-history references so a surviving merge target cannot be deleted or archived while former names still resolve through it.

## Lifecycle commands

All mutations use Zod validation, one Dexie transaction, one compound change-log command, and global
Undo/Redo:

- create and rename;
- update color/icon presentation;
- move earlier or later;
- set family default without rewriting existing assignments;
- archive and restore an unused value;
- delete an unused value;
- assign and unassign;
- Replace and Archive;
- Merge.

Archive and destructive delete are blocked while a value is assigned. The structured
`CategoryValueInUseError` includes the usage count and points the future UI toward Replace and Archive
or Merge. A value that is already the target of merged history also cannot be archived, deleted, or
Replace-and-Archived; it must be merged onward so the full alias chain remains resolvable.

Replace and Archive moves references to an active replacement in the same family, carries the default
when needed, and archives the old value. It does not transfer aliases.

Merge moves and deduplicates references, transfers the old name and aliases to the surviving value,
retains the old record as merged provenance, and supports exact Undo/Redo.

## Dexie schema impact

Dexie upgrades from version 3 to version 4 with two stores:

- `categoryValues`
- `categoryAssignments`

The upgrade adds no seed values and performs no unreviewed conversion of existing free-text fields.
`ScheduleBlock.category` and `CalendarEvent.category` therefore remain unchanged in this phase.

## Explicit non-goals for 3E-1A

- no Categories management route or navigation change;
- no selectors added to Planning, Tasks, or Learner Notices yet;
- no Library, Resource, Activity, Assessment, Standard, or Template records;
- no migration of existing free-text category fields;
- no attachment, external-drive, standards, or AI categorization work;
- no Calendar, navigation, or School Year lifecycle redesign.
