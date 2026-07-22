# Learners Workspace Creation & Layout Closure

## Purpose

Close the gap between learner-context lifecycle management and daily creation. The Learners route now provides an explicit way to add an Individual, Group, or Class and reorganizes the workspace around a searchable directory plus a selected-context work area.

## Scope

- Add Individual, Group, and Class from the selected non-archived school year.
- New contexts use stable IDs, active lifecycle state, Zod validation, one Dexie transaction, a compound change log, and global Undo/Redo.
- Prevent duplicate names within the same school year and context kind, including archived records.
- Keep creation closed until requested.
- Add a searchable directory with type and lifecycle filters.
- Keep per-kind Add actions visible in the directory.
- Move selected context identity and frequent actions to the top of the work area.
- Organize the selected context into Planning, Support & Notices, and Details tabs.
- Preserve the mobile selected-context pattern and keep the full directory hidden on narrow screens.
- Preserve historical records and the existing archive, restore, and safe-empty-delete rules.

## Explicit non-goals

- Membership assignment between Individuals, Groups, and Classes.
- Bulk learner import or roster synchronization.
- Category selector integration.
- Changes to Schedule, Calendar, School Year lifecycle, Library, Templates, or Standards.
- Automatic copying of learner contexts into another school year.

## Creation semantics

- The selected school year supplies `schoolYearId`.
- Creation is blocked for an archived school year.
- New records always begin with `status: active`.
- Preferred name is stored only for Individuals.
- Names are trimmed and compared case-insensitively within the same school year and kind.
- Undo deletes only the newly created context; Redo restores the same stable record.

## UX rules

- The top Add menu and directory Add actions expose Add Individual, Add Group, and Add Class.
- Search includes name, preferred name, and notes.
- Type filters are All, Individuals, Groups, and Classes.
- Lifecycle remains Active or Archived.
- Selected context actions keep New plan and Edit visible; lower-frequency navigation sits in More.
- The tabbed work area avoids stacking Planning, Support, and Details into one long page.
- Native details/summary menus close on Escape and return focus to their summary.
