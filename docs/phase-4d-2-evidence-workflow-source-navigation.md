# Phase 4D-2 — Evidence Record Workflow & Precise Source Navigation

Phase 4D-2 exposes the existing v17 Assessment Evidence mutation domain through Learner Progress. It
does not introduce a second Evidence model or a database migration.

## Evidence workflow

Learner Progress supports teacher-controlled:

- Add Evidence;
- Edit Evidence;
- Archive Evidence;
- Restore Evidence;
- global Undo/Redo through the existing change-log infrastructure.

The editor supports canonical Student ownership, Evidence date/title/kind, optional Context, Lesson
Plan, Session, Library Assessment, multiple Standards, kind-specific Score/Proficiency/Observation
fields, and notes.

Score, Proficiency, and Observation remain structurally distinct. Classroom does not translate these
records into mastery, grades, learner rank, readiness, or an automatic growth score.

## School Year date safety

Create and update now validate `occurredOn` against the selected School Year's `startsOn`/`endsOn`
inside `AssessmentEvidenceMutationService`.

This is a write-time safeguard. Existing historical malformed rows remain readable and may still be
archived/restored. Editing one requires correcting the date before the updated record can be saved.

## Historical sources

Optional source records may disappear after Evidence is recorded. Existing unchanged links continue
to use retained snapshots for Context, Lesson Plan, Session, Assessment, and Standards. The editor
shows those historical snapshots without pretending they are current clickable sources.

A learner is not required to belong to the current retained roster of a linked Class/Group because
roster membership has no historical effective-date model.

## Precise return navigation

Phase 4D-2 adds a distinct `return=progress` contract. It preserves:

- School Year;
- Learners / Contexts / Standards view;
- selected source scope;
- exact Evidence id;
- lifecycle and Evidence-kind filters;
- School Year / This Week / Last Week / Custom period.

Source workspaces show `Back to Learner Progress`. Planning, Session, and Teaching Reflection links
thread the same state through their mutation/navigation paths.

If Learner Progress was opened from Teaching Review, the Progress return state also retains the parent
Teaching Review queue/focus/period. Returning to Learner Progress restores its exact Evidence and also
restores the `Back to Teaching Review` contract.

## Cross-workspace exact links

- Teaching Review Assessment Evidence integrity issues open `#/learner-progress?evidence=<id>` with
  the Review return contract.
- Teaching Reflection related Evidence rows open the exact Learner Progress Evidence record.
- Learner Progress current Student/Context/Plan/Session/Assessment/Standard links receive
  `return=progress` state.
- Historical snapshots remain text-only when the current source no longer exists.

## Retained platform contracts

- app `20.0.0-pilot.1`
- DB schema v17
- Portable Backup schema v17
- Teaching Insights contract v2
- Teaching Review contract v1
- Learner Progress contract v1

No expected-Evidence denominator, automatic Evidence-gap inference, mastery, grade, rank, AI
interpretation, or cloud/multi-user behavior is introduced.
