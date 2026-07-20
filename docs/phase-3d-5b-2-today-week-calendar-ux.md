# Phase 3D-5B-2 — Today, Week & Calendar UX Closure

This slice closes the highest-priority Workspace navigation and density issues identified by the
Phase 3D-5 visual audit. It changes presentation and navigation only; Classroom records, mutation
services, Undo/Redo, and IndexedDB schema remain unchanged.

## Today

- The schedule is first in DOM and visual order on tablet and mobile.
- Desktop keeps the supporting column on the left and the schedule as the larger primary column.
- Date navigation contains date controls only.
- A single date-aware `Add` menu provides New plan, New event, New task, and Learner notice entry
  points.
- Schedule occurrences retain the contextual `Plan this block` action.
- The unfinished disabled Quick capture panel is removed.
- Technical reminder and learner-context explanations are removed from the primary workspace.

## Week

- Every day names its creation action `Add plan` instead of using an ambiguous icon-only plus.
- Existing date-specific planning URLs and horizontal Week behavior are preserved.

## Calendar

- Desktop retains the complete month grid and existing source-record actions.
- Repetitive management links remain available but are visually quiet until hover or keyboard focus.
- Calendar day planning actions are explicitly labeled `Plan`.
- At 900px and below, Calendar switches to a compact month agenda:
  - only current-month days are rendered;
  - each day shows source counts and up to three highlights;
  - full occurrence cards and management actions remain inside a native expandable section;
  - every day keeps Plan and View in Week entry points;
  - empty days stay compact instead of rendering large cards.
- Technical v20 loading and quarantine language is replaced with teacher-facing text.

## Shared Add menu

`WorkspaceAddMenu` is a reusable native-details control with keyboard-accessible links. The Today
menu is date-aware and returns planning to Today. It does not create duplicate records or introduce a
new persistence layer.

## Safety

- No data-model changes
- No database-version upgrade
- No mutation-service changes
- No new UI framework
- No change to global Undo/Redo
- No change to Today, Week, or Calendar read-model semantics
- Schedule exceptions and Plan-this-block behavior remain intact
- Week horizontal scrolling and focus behavior remain intact

## Verification baseline

- Vitest: 49 files / 190 tests
- Playwright: 38 tests expected after adding two Workspace UX acceptance cases
