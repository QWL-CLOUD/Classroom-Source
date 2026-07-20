# Phase 3D-5B-3 — Planning & Session Ergonomics

## Scope

This phase closes the high-frequency usability issues in Planning, Session, and Lesson Flow without changing Classroom records, validation, scheduling semantics, or the database schema.

## Changes

- Lesson Flow adds new steps at the bottom of the working sequence.
- The empty state includes one clear `Add step` action.
- Every step has one compact `More` menu with:
  - Add before
  - Add after
  - Duplicate
  - Move earlier
  - Move later
  - Delete step
- Adjacent and duplicated steps scroll into view and focus the step-title field.
- Step headers show phase and duration while removing the always-visible icon toolbar.
- Planning and Session use one record-level heading instead of a generic phase banner plus a second editor heading.
- Planning keeps Save and Save-and-schedule visible; Delete moves to `More`.
- Session keeps Save and completion visible; Return to Unscheduled moves to `More`.
- Long editors retain the shared sticky action bar and mobile bottom spacing.

## Safety boundaries

- No IndexedDB version change.
- No entity/schema change.
- No mutation-service change.
- No change to Lesson Flow persistence or Session content override behavior.
- No change to Plan-this-block, Schedule exceptions, Lesson Series ordering, Bump, or global Undo/Redo.
- Hash Router and `/Classroom-Source/` production base remain unchanged.

## Verification target

- Vitest: 50 files / 193 tests passed.
- Playwright: 39 / 39 passed.
- Planning and Session remain accessible at desktop and 390px mobile width.
