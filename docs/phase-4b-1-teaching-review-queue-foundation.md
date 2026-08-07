# Phase 4B-1 — Teaching Review Queue Foundation

Baseline: `main @ d3884351b8e3d52a7e335ade4a475efedac662a5`

## Goal

Create a formal, read-only Teaching Review workspace that turns already-derived Teaching Insights
facts into source-linked teacher follow-up queues.

Teaching Review does not score, rank, infer mastery, judge teaching quality, persist reviewed state,
create hidden Tasks, or automatically mutate source records.

## Architecture

Phase 4B-1 reuses the existing Teaching Insights read path:

`canonical records -> TeachingInsightsView -> TeachingReviewReadModel -> Teaching Review UI`

The Teaching Review read model is a pure derivation. It does not query or write IndexedDB directly
and it does not extend Teaching Insights contract v2.

## First-release queues

### Awaiting Reflection

Completed Sessions without an active Reflection.

- no retained Reflection -> `Add Reflection`
- archived retained Reflection -> `Review Reflection`

The archived case is important because DB v17 allows at most one Teaching Reflection per Session.
The existing archived Reflection must be reviewed/restored rather than duplicated.

### Past still Scheduled

Reuses the existing `past-session-still-scheduled` Teaching Insights integrity rule and links back to
the Session source. Teaching Review does not assume whether the Session should be completed,
rescheduled, cancelled, or otherwise corrected.

### Open Next Steps

Groups open Reflection-linked Task counts by Teaching Reflection source.

Phase 4B-1 links to the Reflection and the existing Tasks workspace. Precise task focus is deferred to
Phase 4B-2.

### Record Issues

Shows the remaining Teaching Insights integrity issues after Past still Scheduled is separated into
its own review queue.

`Needs Review` remains the canonical integrity-rule source. Teaching Review does not create a second
integrity engine.

## Explicit exclusions

Phase 4B-1 does not:

- treat completed Sessions without Assessment Evidence as a problem;
- infer that Evidence is required for every Session;
- add learner progress or mastery interpretation;
- add a reviewed/dismissed queue state;
- change Session, Reflection, Task, Evidence, Standard, Library, or Planning mutations;
- add background jobs or caches;
- add DB or backup tables;
- add AI recommendations.

## Navigation

Adds `#/teaching-review` under the Reflect navigation group and an `Open Teaching Review` action from
Teaching Insights.

Existing source links are reused where precise enough. Record-level focus and explicit
return-to-review behavior are Phase 4B-2 scope.

## Version impact

- App: `20.0.0-pilot.1` retained
- Database: v17 retained
- Portable Backup: v17 retained
- Teaching Insights contract: v2 retained
- Teaching Review contract: v1, derived/read-only only

## Acceptance

- Teaching Review School Year selection is URL-backed.
- Awaiting Reflection distinguishes missing from archived Reflections.
- Past still Scheduled is separated from remaining Record Issues.
- Open Next Steps are grouped by Reflection source and reflect existing Task states.
- No Evidence-gap queue is introduced.
- Source links route to existing Session, Reflection, and Tasks workflows.
- `#/teaching-review` is discoverable under Reflect and from Teaching Insights.
- 390px has no page-level horizontal overflow.
- Automated accessibility has no detectable violations in the seeded first-release workflow.
- Full `npm run check` and targeted Chromium E2E pass.
- Manual QA confirms the review queues remain readable and clearly non-judgmental.
