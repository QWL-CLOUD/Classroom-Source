# Phase 3D-5B-7 — Collapsible Navigation Groups

## Goal

Keep daily teaching destinations immediately visible while making secondary resources, reflection, and data-management destinations easier to scan as Classroom grows.

## Navigation hierarchy

Daily destinations stay permanently visible:

- Today
- Week
- Calendar
- Agenda
- Tasks
- Learners

Secondary destinations use three collapsible groups:

- Resources
  - Library
- Reflect
  - Teaching Insights
- Settings & Data
  - Import Center
  - Export & Backup
  - Settings
  - System Health

Resources is expanded by default. Reflect and Settings & Data are collapsed by default.

## Interaction rules

- Each group heading is a keyboard-operable button with `aria-expanded` and `aria-controls`.
- Group preferences are stored only in local browser storage under `classroom.navigation.groups.v1`.
- Entering a route inside a collapsed group opens that group so the active destination is visible.
- Mobile navigation uses the same hierarchy and preferences as the desktop sidebar.
- When the entire desktop sidebar is reduced to its icon rail, every destination remains available. Returning to the expanded sidebar restores the saved group choices.
- No database schema, repository record, mutation command, or Undo/Redo history is involved.

## Page hierarchy labels

- Learners uses the Workspace eyebrow.
- Library uses Resources.
- Import Center, Export & Backup, Settings, System Health, and Migration use Settings & Data.
- Teaching Insights remains under Reflect.

## Non-goals

- Adding Categories, Templates, Standards, or other routes before their product phases.
- Changing route URLs.
- Redesigning page content.
- Persisting UI preferences in Dexie.
- Changing the existing whole-sidebar icon collapse behavior.

## Verification

- Vitest: 55 files / 207 tests passed.
- Playwright discovery: 43 tests in 28 files.
- Two new Playwright cases cover desktop persistence/icon-rail behavior and mobile drawer active-group behavior.
- Full Playwright execution remains a required local release gate.
