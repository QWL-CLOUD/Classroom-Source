# Phase 3I-0 — Assessment Evidence Domain & Persistence

## Delivered scope

Phase 3I-0 introduces a canonical, Student-owned Assessment Evidence domain without adding capture
or progress UI.

The implementation includes:

- a discriminated `AssessmentEvidenceRecord` for score, proficiency, or observation evidence;
- required canonical Student and school-year ownership;
- optional historical Context, Lesson Plan, Session, Library Assessment, and Standard links;
- source snapshots that remain readable after optional sources are deleted or archived;
- Dexie schema v12 and indexes for Student, school year, date, context, Assessment, and Standards;
- transactional create, update, archive, and restore mutations;
- persistent global Undo/Redo commands;
- source-oriented read services for future Student and context progress views;
- Backup/Restore v12 support with v10 and v11 compatibility;
- school-year deletion protection while evidence remains.

## Result semantics

The three evidence kinds remain distinct:

- `score`: numeric value and optional maximum, or a categorical score label;
- `proficiency`: a labeled level with optional rank and scale identity;
- `observation`: anecdotal text.

The domain does not calculate or persist final grades, averages, percentages, mastery, rankings, or
cross-scale summaries.

## Historical-source rules

Evidence ownership never moves away from the canonical Student. Roster removal, Individual unlink,
context archive, Student archive, and optional source deletion do not delete evidence.

A mutation validates new source references against current records. When an existing optional source
has later disappeared, an update may preserve that unchanged ID and its original snapshot. Restore
validates evidence structure without requiring optional source records to still exist.

## Deferred

Phase 3I-0 does not include:

- evidence capture UI;
- Student or context progress UI;
- report or export UI;
- derived grades or automatic insights.
