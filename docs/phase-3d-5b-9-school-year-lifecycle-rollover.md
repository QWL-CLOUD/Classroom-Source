# Phase 3D-5B-9 — School Year Lifecycle & Rollover Closure

## Purpose

Close the gap between displaying an active school year and giving the user a safe, complete way to manage it.

## Completed scope

- School Years workspace under Settings & Data.
- Create and edit school-year labels and date ranges.
- Set exactly one available school year as active in one Dexie transaction.
- Preserve all Learner, Plan, Session, Schedule, Task, and history assignments when active year changes.
- Archive and restore historical school-year containers without hiding linked records from historical views.
- Delete only empty, non-active school years.
- Stable School Year IDs; rename does not change links.
- Global Undo/Redo for create, edit, set active, archive, restore, and delete.
- Rollover readiness messaging and a user-confirmed “Prepare next school year” draft.
- No automatic yearly switch and no automatic copying of learners, classes, groups, schedules, plans, or sessions.
- Learners school-year selector for active and historical years.
- Active-year links in the shell and a System Health repair path.

## Data rules

- `active` identifies the one current school-year context.
- `lifecycleState: archived` removes a year from normal active use while preserving linked history.
- Existing records retain their original `schoolYearId` when another year becomes active.
- An active school year cannot be archived or deleted.
- A school year with linked learner contexts cannot be deleted.
- Optional lifecycle fields preserve backward compatibility; no Dexie store migration is required.

## Rollover boundary

This phase prepares the next school-year container and makes the active-year switch safe. It does not copy or reassign records. Preview-based learner continuation, placement, and schedule copy remain planned for the later School Year Rollover phase after Backup & Recovery.

## Verification target

- Vitest: 60 files / 224 tests.
- Playwright: 44 / 44.
- Formatting, ESLint, TypeScript, privacy scan, production build, build verification, and axe pass.
