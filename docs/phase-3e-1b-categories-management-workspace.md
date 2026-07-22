# Phase 3E-1B — Categories Management Workspace

Phase 3E-1B exposes the Phase 3E-1A managed-vocabulary domain through one focused, accessible workspace.

## Route and navigation

- Route: `#/categories`
- Navigation: `Resources → Categories & Labels`
- The Resources group opens automatically when the route is active.
- The route retains the selected family in the `family` search parameter.

## Supported family management

The workspace exposes the seven locked category families without allowing arbitrary family creation:

- Template Formats
- Focus Tags
- Purpose Tags
- Theme Tags
- Resource Formats
- Task Labels
- Support Areas

For each family, users can:

- create values with optional managed color and icon keys;
- edit name, color, and icon as one undoable command;
- reorder active values with explicit earlier/later controls;
- set one active default without rewriting existing assignments;
- view direct usage counts and merge-history dependencies;
- archive unused values and restore archived values;
- delete only unused values;
- use Replace and Archive to move references transactionally;
- merge values while retaining former names as aliases.

## Safety rules

- In-use values do not expose destructive direct archive behavior.
- Values with historical merged sources must be merged onward so alias resolution remains intact.
- Replace and Archive and Merge require a reviewed target and confirmation.
- Archived values disappear from new selection but remain visible and restorable.
- Merged values remain in a read-only history view.
- Every mutation continues to use Zod validation, a Dexie transaction, the compound change log, and global Undo/Redo.

## Responsive and accessibility behavior

- Desktop uses a family navigation rail and a focused value-management column.
- Narrow layouts switch to a labeled family selector.
- Reorder controls have explicit accessible names and are not drag-only.
- Status filters, forms, safe-resolution controls, and More menus remain keyboard reachable.
- The Playwright acceptance case checks the Resources route behavior, core management lifecycle, transactional replacement, mobile horizontal overflow, and axe results.

## Explicit non-goals

- No Library, Lesson Template, Standards, or attachment records are created.
- No arbitrary free-text migration is performed.
- Schedule Parent Blocks remain outside Categories.
- Calendar, School Year lifecycle, and completed navigation behavior are not redesigned.
