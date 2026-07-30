# Phase 3I-0.5B — Canonical Import Center

## Outcome

Classroom now uses the existing Settings & Data `#/import` route as the one canonical import
workspace for reviewed Standards and Class/Group roster imports.

The route accepts explicit import state:

```text
#/import?type=standards
#/import?type=roster
#/import?type=roster&context=<class-or-group-id>
```

No second Import Center, route, preview state, or commit service was introduced.

## Import type selection

The Import Center presents all approved import domains in one selector:

- Rosters — available in this phase;
- Standards — available in this phase;
- Activities — reserved for Phase 3I-0.5C;
- Resources — reserved for Phase 3I-0.5D;
- Assessments — reserved for Phase 3I-0.5E.

Unsupported or conflicting query parameters produce a safe route error and do not create preview
or write state. Changing import type remounts the selected workspace so an uncommitted preview is
not carried into another domain.

## Standards import

The reviewed Standards workflow was moved from the route component into a domain workspace while
preserving its existing behavior:

- CSV and XLSX parsing through the shared source adapters;
- worksheet selection;
- source attribution;
- column mapping;
- hierarchy and duplicate validation;
- preview without database writes;
- explicit update and commit confirmation;
- atomic commit;
- persistent global Undo/Redo.

New Standards imports write canonical `importRuns` records. The legacy
`standardImportBatches` store remains readable for historical compatibility but receives no new
records.

## Roster import

Class and Group roster import moved out of the Learners workspace and into the same Import Center.
The context-owned roster page now provides only a deep link with the target context preselected.

The canonical roster workflow provides:

- Class/Group target selection;
- CSV and XLSX parsing through the shared source adapters;
- explicit worksheet selection;
- reviewed Student decisions for create, reuse, and skip;
- no-write preview;
- explicit commit confirmation;
- one atomic import transaction;
- one canonical `importRuns` record;
- one persistent global Undo/Redo action.

Student identity remains canonical and separate from roster membership. Class and Group remain peer
contexts with independent rosters. Individual contexts cannot be roster import targets.

## Import history and Undo/Redo

Both newly committed domains use the `import-center.*` command family:

```text
import-center.standards.reviewed
import-center.roster
```

Forward and inverse operations include the canonical import run and every affected domain record.
Undo removes the import run and reverses the complete batch; Redo reapplies the same reviewed
transaction.

## Deferred

This phase does not implement:

- Activities import;
- Resources import;
- Assessments import;
- binary attachment persistence;
- CONTENT navigation rename;
- Library, Standards, or roster contextual import buttons beyond the roster deep link;
- a second import route or duplicated import state.
