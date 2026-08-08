# Phase 4D-3 — Evidence Review Coverage & UX Closure

Phase 4D-3 closes the first Learner Progress release without changing the v17 Assessment Evidence
persistence model. The workspace remains a review of recorded Evidence, not a mastery, grade, rank,
or expected-Evidence system.

## Current retained roster coverage

Context mode may compare recorded Evidence with the **current retained roster** for active Class and
Group contexts in the selected School Year.

The comparison is deliberately narrow:

- Class and Group are peer planning contexts; coverage is calculated from each context's explicit
  retained `RosterMembership` records;
- only Evidence explicitly linked to the relevant Context ids can represent those roster learners;
- learners are deduplicated when reviewing all active Class/Group contexts;
- Individual contexts do not use roster coverage because Individual is a one-on-one planning context,
  not a roster;
- archived, historical, snapshot-only, or unavailable Context scopes do not expose a roster
  denominator;
- a historical School Year keeps its recorded Evidence readable but does not reconstruct past
  membership from retained roster links.

The displayed counts mean only “retained roster learners” and “roster learners represented by at
least one recorded Evidence record in the selected review filters.” They are not mastery, completion,
readiness, or Evidence-gap judgments.

## Rich Evidence review filters

Learner Progress adds URL-backed filters for:

- Library Assessment;
- linked Standard;
- Session source;
- timeline order: newest first / oldest first.

These combine with the existing School Year, period, lifecycle, Evidence kind, and
Learner/Context/Standard scope. Source filters may legitimately produce an empty state; the UI uses
`No recorded Evidence in this scope` rather than claiming missing required Evidence.

## Same-scale proficiency history

When the selected Evidence is Proficiency and contains an explicit `scaleKey`, Learner Progress may
show the same learner's recorded labels on that same scale within the selected School Year.

The history:

- is chronological;
- can include archived records and labels them as archived;
- shows recorded labels and source titles only;
- does not infer a trend, growth score, mastery state, readiness, or learner ranking;
- is not shown for unkeyed proficiency records because scale identity is not explicit.

## Source entry points

The first-release entry-point closure adds direct Learner Progress links from:

- canonical Student profile;
- selected Class / Group / Individual Context;
- Standard detail;
- Library Assessment detail;
- Session editor;
- Teaching Reflection (`Session Evidence`).

Entry links seed only explicit source state. They do not create Evidence automatically and do not
reconstruct Context membership.

## Historical and archived behavior

Historical School Years remain selectable. Evidence source snapshots stay readable when current
Context, Plan, Session, Assessment, or Standard records are unavailable. Archived source records are
labeled as archived rather than silently treated as current.

Current-retained-roster coverage is unavailable for historical School Years and archived/historical
Context scopes because the data model does not contain membership effective dates.

## Retained platform contracts

- app `20.0.0-pilot.1`
- DB schema v17
- Portable Backup schema v17
- Teaching Insights contract v2
- Teaching Review contract v1
- Learner Progress contract v1

Phase 4D-3 does not add an expected-Evidence denominator, mastery, grades, learner rank, automatic
progress scores, Observation NLP/AI interpretation, cloud sync, or multi-user publishing.
