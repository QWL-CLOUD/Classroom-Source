# Classroom v20 Development Roadmap

Recovered and corrected after Phase 4A-2.

Baseline for this roadmap: `main @ b7202ae` (Phase 4A-2 merged).

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

## Phase 4A-2.1 — Teaching Insights UI & Recovery Closure — current

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

## Phase 4B — Teaching Review & Drill-down

Goal: turn descriptive facts into a teacher-controlled review workflow without making Insights an
editing surface.

First-release candidates:

- selected-period / weekly Teaching Review;
- drill down from Needs Review to exact source records;
- review completed Sessions without Reflection;
- review supported Evidence gaps/incomplete links;
- return to Session, Reflection, Evidence, Planning, Standards, Content, or Tasks;
- explicit follow-up through existing source workflows.

Constraints:

- no hidden review-state model in the first release unless pilot use proves it necessary;
- no automatic mutation;
- no implicit Task creation;
- Insights remains read-only.

## Phase 4C — Reflection & Next Actions

Core capability was pulled forward into Phase 4A-2 and must not be redesigned as a competing
Reflection model. Future work under this label is limited to pilot-proven refinements of the existing
v17 domain.

## Phase 4D — Learner Progress & Evidence Review

Goal: teacher-controlled, source-traceable evidence review.

Candidates:

- learner Evidence timeline;
- Standard-centered Evidence view;
- Class / Group / Individual context views;
- Evidence gaps and observation trends supported by explicit records;
- drill-down to exact Evidence.

Hard boundaries:

- Evidence is not a grade;
- Evidence count is not mastery;
- no Evidence is not failure;
- no learner ranking or black-box ability score;
- Group membership is not Class membership;
- roster membership does not create an Individual workspace.

## Phase 4E — Reports & Export

Recommended order:

1. teacher-facing summary;
2. CSV export;
3. printable report;
4. PDF export;
5. configurable templates after report semantics stabilize.

Preview included fields before export; do not upload or send automatically; distinguish internal
teacher reports from any future family-facing reports.

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
