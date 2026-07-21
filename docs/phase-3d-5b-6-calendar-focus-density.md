# Phase 3D-5B-6 — Calendar Focus & Density Closure

## Problem

The Calendar workspace exposed the correct recurring Schedule, Event, and Session records, but the
mobile month view rendered every day from the beginning of the month and allowed ordinary recurring
Schedule occurrences to dominate the page. Users could miss dated Events, Sessions, and management
actions because they appeared far below the first week.

## Scope

- Group the compact Calendar by week.
- Open the selected-date week by default and position it below the sticky application header.
- Keep other weeks collapsed while preserving keyboard-accessible native `details` controls.
- Show Event, Session, and date-specific Schedule adjustments before ordinary recurring Schedule.
- Represent recurring Schedule as a count and an on-demand details section.
- Limit desktop day cells to two visible dated items, with additional dated items and recurring
  Schedule available through collapsed details.
- Distinguish the selected date from the real current date.
- Allow date selection from both desktop and compact Calendar views.
- Preserve existing Event, Session, occurrence-editing, Plan, and View-in-Week actions.

## Non-goals

- No Dexie schema or domain-record changes.
- No changes to Schedule recurrence or exception mutation semantics.
- No Calendar Event, Planning Item, or Session duplication.
- No changes to global Undo/Redo.
- No Categories & Labels work.
- No separate visible-month URL state in this repair.

## Acceptance

1. Opening `#/calendar?date=<selected date>` on a compact viewport opens and positions the week that
   contains the selected date.
2. Other weeks remain collapsed by default.
3. Event and Session highlights remain visible without expanding recurring Schedule.
4. Ordinary recurring Schedule appears as a count and can be expanded for occurrence management.
5. Added or modified Schedule occurrences remain visible as date-specific changes without expansion.
6. Desktop day cells show at most two dated cards before a `+ N more` disclosure.
7. Today and Selected are independently identifiable.
8. Selecting a Calendar date updates the shared `date` search parameter.
9. Compact Calendar has no horizontal overflow and no axe violations.
10. Existing Calendar navigation and cross-route date behavior remain intact.

## Required release gate

- Formatting, ESLint, TypeScript, privacy, production build, and build verification pass.
- Vitest target: **54 files / 204 tests passed**.
- Playwright target: **41 discovered / 41 passed**.
- Manual compact QA confirms that the selected week is visible below the sticky header and that
  ordinary recurring Schedule remains collapsed until requested.
- Manual desktop QA confirms that Plan links are not overlapped by adjacent date headers and that
  date-specific Schedule adjustments remain visible.
