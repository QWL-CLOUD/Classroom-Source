# Classroom v20 Development Roadmap

Updated for Phase 4F implementation after Phase 4E closure.

Current implementation baseline: `main @ 3a97313958e86a53acd9d5fe21aaa97e85ab0f7b` (Phase 4E merged).

## Product boundary

Classroom remains a local-first, teacher-controlled workspace.

Teaching Insights is the descriptive/read-only layer:

- it derives facts from retained canonical records;
- it may provide source traces and drill-down navigation;
- it does not own edits to Sessions, Evidence, Standards, Content, Tasks, or planning records;
- it does not analyze Teaching Reflection narrative;
- it does not score teaching quality, infer mastery, rank learners, or generate AI recommendations.

Teacher judgment belongs in the Session-linked Teaching Reflection. Actions remain in their owning
domains: Tasks in Tasks, Evidence in Assessment Evidence, plan changes in Planning, and Session
changes in Session workflows.

## Completed foundation

### Personal Pilot Closure — complete

Local persistence/recovery, privacy-safe System Health, Backup/Restore safeguards,
Chromium/WebKit pilot readiness, and recurrence-safe School Year lifecycle.

### Phase 4A-0 — Teaching Insights Metrics & Data Contract Audit — complete

Source-of-truth, time, School Year, planning-context, metric, and unsupported-inference semantics
were reviewed before implementation.

### Phase 4A-1 — Teaching Insights Read-Only Foundation — complete

Source-linked derived read models and the read-only Insights workspace now cover teaching activity,
planned-versus-taught, Assessment Evidence coverage, context distribution, Standards and Content
planning links, classification usage, Needs Review, and School Year filtering.

### Phase 4A-2 — Teaching Reflection & Next Steps — complete

This phase pulled forward the core capability originally planned for Phase 4C:

- DB schema v17 / Portable Backup v17 / 33 tables;
- one persistent Teaching Reflection per completed Session;
- teacher-authored `whatWorked`, `whatToAdjust`, and `additionalNotes`;
- related Assessment Evidence context;
- ordinary Task-based Next Steps;
- Reflection coverage and Task-state facts in Teaching Insights;
- Reflection narrative remains outside analytics.

## Phase 4A-2.1 — Teaching Insights UI & Recovery Closure — complete

Goal: close responsive/UI and repository-recovery gaps without changing analytics or persistence.

Scope:

1. Repair Standards / Content nested-card header overflow.
2. Make long labels and summary rows shrink/wrap safely.
3. Add no-page-overflow and no-card-overflow regressions at 1024px, 1180px, 1280px, and 1440px
   while retaining the 390px check.
4. Keep source tables horizontally scrollable inside bounded scrollers.
5. Align README, Data Model, and Testing documentation with DB/Backup v17 and the implemented
   Teaching Insights / Teaching Reflection capabilities.
6. Retain app version `20.0.0-pilot.1`; no DB or backup migration.

Acceptance:

- no page-level horizontal overflow at protected widths;
- Standards and Content cards have no internal horizontal overflow;
- existing Insights metrics/source links retain their semantics;
- full `npm run check` passes;
- targeted Teaching Insights Chromium E2E passes;
- manual desktop review confirms readable Standards/Content cards;
- no private user data is added to the repository.

## Phase 4B-0 — Teaching Review & Drill-down Audit — complete

The audit established two boundaries:

- `Needs Review` remains a data/workflow-integrity surface rather than becoming a catch-all teacher
  review queue.
- Teaching Review is a separate read-only workflow derived from Teaching Insights facts. It may
  navigate into writable source workflows, but it does not own those mutations.

The audit also found that Session, Reflection, Plan, Context, and Student sources already have useful
deep links, while Standards, Library, Tasks, and Assessment Evidence still need more precise
record-level navigation contracts.

## Phase 4B-1 — Teaching Review Queue Foundation — complete

Goal: establish the first formal Teaching Review workspace without persistence or new inference.

First-release queues:

- completed Sessions without an active Reflection;
- Past still Scheduled Sessions;
- Reflection sources with open Next Step Tasks;
- remaining Teaching Insights record-integrity issues.

Important semantics:

- a Session with an archived Reflection is routed to that retained Reflection for review/restore;
  Classroom does not try to create a second Reflection;
- completed teaching without Assessment Evidence is not automatically treated as a review problem;
- open Next Steps are grouped by Reflection source while Task editing remains in Tasks;
- no reviewed/dismissed state is persisted.

Architecture:

`TeachingInsightsView -> TeachingReviewReadModel -> Teaching Review workspace`

DB schema v17, Portable Backup v17, Insights contract v2, and app version
`20.0.0-pilot.1` are retained.

## Phase 4B-2 — Precise Drill-down & Return Navigation — complete

Goal: make Teaching Review a trustworthy navigation layer rather than a list of broad workspace
links.

Scope:

- Standard, Library item, and Task deep links select the exact retained record;
- Reflection-linked Next Steps open a filtered Tasks view for that Reflection;
- Review-origin source URLs carry the School Year, queue, and source focus explicitly;
- AppShell shows a consistent Back to Teaching Review return bar for Review-origin workspaces;
- Session, Planning, and Teaching Reflection workflows understand `return=review`, so explicit
  mutations return to the originating Review queue instead of Learners;
- Teaching Review restores focus to the originating record when it still exists and falls back to
  the queue heading when the source issue has been resolved.

Assessment Evidence remains intentionally outside this phase because it still lacks a dedicated
review workspace; exact Evidence navigation belongs with Phase 4D rather than creating a temporary
4B-only surface.

DB schema v17, Portable Backup v17, Insights contract v2, Teaching Review contract v1, and app
version `20.0.0-pilot.1` remain unchanged.

## Phase 4B-3 — Period Review & UX Closure — complete

Goal: close the first Teaching Review workflow with explicit, URL-backed teaching periods and
responsive/readability safeguards without adding reviewed/dismissed persistence.

Scope:

- School Year, This Week, Last Week, and Custom review periods;
- Monday-based week semantics using the existing local-date utilities;
- Custom ranges are validated and clipped to the selected School Year;
- Awaiting Reflection, Past still Scheduled, and Open Next Steps are filtered by the originating
  Session/Reflection date;
- Record Issues remain School Year-wide because many integrity records do not have a meaningful
  occurrence date;
- Review period survives source drill-down, Back to Teaching Review, and Session/Planning/Reflection
  mutation returns;
- changing School Year preserves/clips a compatible custom range and clears stale row focus;
- mobile and intermediate-width layouts keep period controls and review queues page-contained.

DB schema v17, Portable Backup v17, Teaching Insights contract v2, Teaching Review contract v1,
and app version `20.0.0-pilot.1` remain unchanged.

## Phase 4C — Reflection & Next Actions

Core capability was pulled forward into Phase 4A-2 and must not be redesigned as a competing
Reflection model. Future work under this label is limited to pilot-proven refinements of the existing
v17 domain.

## Phase 4D-0 — Learner Progress & Evidence Data Contract Audit — complete

The merged v17 Evidence domain already provides canonical Student ownership, School Year/date,
Score/Proficiency/Observation kinds, optional Context/Plan/Session/Assessment/Standard links,
historical source snapshots, lifecycle, Undo/Redo, Backup coverage, and indexes sufficient for the
first learner-progress release.

Audit decision:

- keep DB schema v17 and Portable Backup v17;
- treat Student as the canonical learner identity;
- use `AssessmentEvidenceRecord.contextId` for historical Context review rather than reconstructing
  membership from the current roster;
- do not claim a true Evidence gap because there is no expected-Evidence denominator;
- do not convert heterogeneous scores, proficiency records, or teacher observations into mastery,
  grades, rank, or black-box growth scores.

## Phase 4D-1 — Learner Progress Read Model & Workspace Foundation — complete

Goal: expose canonical Assessment Evidence through a read-only, source-traceable learner review
workspace before opening the existing Evidence mutation domain in UI.

Scope:

- new Reflect route `#/learner-progress` and Learner Progress contract v1;
- URL-backed School Year, School Year / This Week / Last Week / Custom periods, Evidence lifecycle,
  and Evidence-kind filters;
- Learners, Contexts, and Standards views;
- canonical Student timelines and explicit Context-linked Evidence;
- Standard-centered Evidence without implying Standard mastery;
- exact `evidence=<id>` detail within Learner Progress;
- Score, Proficiency, and Observation remain structurally distinct;
- current source links for Student, Context, Plan, Session, Assessment, and Standard;
- retained historical snapshots remain readable but are not presented as current clickable sources;
- responsive/mobile/accessibility regression coverage.

Completed checkpoint boundaries:

- Evidence create/edit/archive/restore UI remains outside 4D-1;
- `return=progress` source-workspace navigation remains outside 4D-1;
- exact Teaching Review Evidence-issue drill-down remains outside 4D-1;
- current-retained-roster coverage UX remains outside 4D-1;
- expected-Evidence / true gap semantics;
- mastery, grades, ranking, automatic progress scores, or AI interpretation.

DB schema v17, Portable Backup v17, Teaching Insights contract v2, Teaching Review contract v1,
and app version `20.0.0-pilot.1` remain unchanged.

## Phase 4D-2 — Evidence Record Workflow & Precise Source Navigation — complete

Goal: expose the existing Evidence mutation domain without changing its persistence model, and make
Learner Progress a safe two-way navigation layer for exact source records.

Scope:

- Add/Edit Evidence directly through the existing `AssessmentEvidenceMutationService`;
- Archive/Restore continue to use the existing global Undo/Redo command history;
- Score, Proficiency, and Observation remain distinct teacher-entered Evidence kinds;
- optional Context, Lesson Plan, Session, Library Assessment, and multi-Standard links are editable;
- unchanged historical missing-source links preserve retained source snapshots rather than forcing
  destructive cleanup;
- create/update enforce that `occurredOn` falls inside the selected School Year while legacy malformed
  rows remain readable and lifecycle-manageable;
- URL-backed `edit=new|<evidenceId>` editor state remains separate from exact `evidence=<id>` detail;
- `return=progress` preserves School Year, period, view, selected source, exact Evidence, lifecycle,
  and kind filters through source workspaces;
- Planning, Session, and Teaching Reflection workflows preserve Learner Progress origin through save,
  mutation, and return paths;
- nested Teaching Review → Learner Progress → source navigation retains both return contracts;
- Teaching Review Assessment Evidence integrity issues open the exact Learner Progress Evidence;
- Teaching Reflection related Evidence rows open the exact Learner Progress Evidence record.

Retained boundaries:

- no DB/Backup migration;
- no automatic Evidence creation;
- no current-roster requirement for historical Context-linked Evidence;
- no mastery, grades, ranking, growth score, AI interpretation, or true Evidence-gap inference.

DB schema v17, Portable Backup v17, Learner Progress contract v1, Teaching Insights contract v2,
Teaching Review contract v1, and app version `20.0.0-pilot.1` remain unchanged.

## Phase 4D-3 — Evidence Review Coverage & UX Closure — complete

Goal: close the first Learner Progress release with safe review coverage, richer source filters,
entry points from the teacher workflow, and explicit historical-state behavior without changing the
Evidence persistence contract.

Scope:

- Context mode current-retained-roster coverage for active Class/Group contexts only, using explicit
  `RosterMembership` records and explicit `Evidence.contextId` links;
- no roster denominator for Individual, archived/historical/snapshot-only, or unavailable Context
  scopes, and no reconstruction of historical membership;
- URL-backed Library Assessment, linked Standard, Session source, and newest/oldest timeline filters;
- same-scale proficiency history only when an explicit `scaleKey` establishes scale identity;
- direct Learner Progress entry points from Student, Context, Standard, Library Assessment, Session,
  and Teaching Reflection;
- historical School Year and archived-source copy that keeps recorded Evidence readable while
  refusing unsupported roster, mastery, grade, rank, growth, or gap claims;
- responsive/accessibility and final Phase 4D regression coverage.

Retained boundaries:

- no DB/Backup migration;
- no expected-Evidence denominator or true Evidence-gap inference;
- no averaging/normalization of heterogeneous scores;
- no mastery, grades, learner ranking, readiness, automatic progress score, or Observation AI/NLP
  interpretation.

DB schema v17, Portable Backup v17, Learner Progress contract v1, Teaching Insights contract v2,
Teaching Review contract v1, and app version `20.0.0-pilot.1` remain unchanged.

## Phase 4E — Session Closeout & Reflection Handoff — complete

Goal: close the high-frequency daily teaching loop without creating a new persisted closeout domain.

Scope:

- daily-origin Session completion (`Learners`, `Today`, `Week`, `Calendar`) stays in the completed
  Session so existing Session Evidence and optional Teaching Reflection actions are immediately
  available;
- Teaching Review and Learner Progress origins retain their existing precise automatic returns;
- Session Evidence carries a validated navigation-only return contract back to the source Session;
- Teaching Reflection Session Evidence returns to the exact Reflection and preserves its original
  daily/Review/Progress handoff;
- Teaching Reflection exposes a direct return to the originating daily surface after reflection work;
- no closeout checklist, required-reflection state, automatic Evidence, or combined mutation is added.

DB schema v17, Portable Backup v17, Learner Progress contract v1, Teaching Insights contract v2,
Teaching Review contract v1, and app version `20.0.0-pilot.1` remain unchanged.

## Phase 4F — Teacher Reports & Export Foundation — current

Goal: make existing canonical teacher-owned Evidence usable outside the Learner Progress workspace
without introducing a second Evidence interpretation layer or a persisted report domain.

Scope:

- a new Reflect → Reports workspace at `#/reports` with one explicit Teacher Internal report type:
  Learner Evidence Summary;
- School Year, learner, period, Evidence lifecycle status, and Evidence kind remain explicit URL-backed
  report filters;
- the report reuses the existing Learner Progress v1 snapshot/read model so Class, Group, Individual,
  archived/current sources, historical snapshots, and Evidence kind boundaries stay identical;
- preview shows recorded Evidence counts, explicit recorded values, teacher observations/notes, and
  linked Context/Assessment/Session/Standard provenance;
- UTF-8 CSV download quotes multiline/commas/quotes, protects spreadsheet formula-like text, and
  preserves source-status provenance;
- print representation hides application chrome/controls while retaining learner, School Year, period,
  filter disclosure, Evidence records, and the Teacher Internal boundary;
- Learner Progress exposes an `Open report` handoff for the currently selected learner/filter scope;
- the existing `#/export` backup route remains stable but user-facing terminology becomes
  `Backup & Recovery` so database recovery is not confused with teacher reports.

Retained boundaries:

- no DB/Backup migration and no persisted report/template/history entity;
- no PDF generator in the foundation; browser print can Save as PDF;
- no family/student-facing report, sharing, email, cloud upload, or publishing;
- no grades, mastery, readiness, learner ranking, progress/growth score, cross-scale averaging,
  expected-Evidence denominator, Evidence-gap inference, or AI interpretation of teacher narrative.

DB schema v17, Portable Backup v17, Learner Progress contract v1, Teaching Insights contract v2,
Teaching Review contract v1, and app version `20.0.0-pilot.1` remain unchanged.

## Phase 5 — Platform Expansion

Only after the local personal product and data semantics are stable:

- accounts and identity;
- cloud sync;
- organization/school tenancy;
- roles and permissions;
- collaboration / school-wide publishing;
- conflict resolution and offline reconciliation;
- optional AI assistance after repeated teacher decisions provide a trustworthy feedback loop.

## Parallel quality track

Personal Pilot continues alongside development.

Priority:

- P0: data loss/corruption/app cannot start;
- P1: wrong writes, Undo/Redo failures, Backup/Restore failures;
- P2: core workflow blocked;
- P3: UX, responsive, accessibility defects;
- P4: preferences and new feature ideas.

P0–P2 pilot defects outrank new feature development.

Continue periodic portable backups, restore rehearsals, Chromium full E2E, WebKit pilot readiness,
System Health review, DB/Backup migration tests, Undo/Redo scope checks, Import no-write preview
checks, accessibility/overflow checks, and the public-source privacy scan.

## Deferred directions

### AI teaching recommendations

`Reliable data -> Trusted metrics -> Teacher review -> Saved decisions -> Repeated feedback -> Optional AI assistance`

### Automatic scheduling / Schedule mutation

Defer because Schedule Blocks, Calendar Events, and Sessions remain distinct domains and automatic
cross-domain mutation has high transactional risk.

### Cloud sync / multi-user / school-wide shared calendar

Treat this as a future architecture program, not a Calendar flag. It requires identity, tenancy,
authorization, publishing rules, conflict/version handling, server persistence, privacy controls,
account recovery, and offline reconciliation.

### Parent / student portal

Not in the near-term roadmap. Revisit only after learner-progress semantics and audience/privacy
requirements are proven through teacher use.
