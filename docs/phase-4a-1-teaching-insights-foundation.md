# Phase 4A-1 — Teaching Insights Read-Only Foundation

## Purpose

Phase 4A-1 replaces the planned Teaching Insights placeholder with a source-linked, read-only dashboard derived from the canonical DB v16 records already stored by Classroom v20.

The release is descriptive. It does not score learners, judge teaching quality, infer mastery, rank contexts, or generate AI recommendations.

## Data and persistence decision

- Database schema remains **v16**.
- Portable Backup remains **v16**.
- No analytics tables, caches, settings, commands, migrations, or mutation services were added.
- Insights state is recalculated from canonical records through one read-only Dexie transaction and pure TypeScript derivation.
- The selected School Year is represented in the URL as `#/insights?schoolYear=<id>` and is not persisted as business data.

## Source-of-truth contract

The first release reads:

- School Years
- Class, Group, and Individual planning contexts
- Students and retained roster memberships
- Lesson Plans
- Session Occurrences
- Assessment Evidence
- Library Activities, Resources, and Assessments
- Standards and Standard Alignments
- Managed Plan category values and assignments

A completed Session is the teaching fact. Schedule Blocks, Calendar Events, and Tasks are not counted as teaching activity.

Class, Group, and Individual are peer planning-context types. A Group is not rolled into a Class, and an Individual context is not inferred from Class or Group roster membership.

Roster membership has no historical effective dates. Evidence coverage is therefore labeled **Current retained roster coverage**, not historical class coverage.

## First-release metrics

- Completed Sessions, completed teaching minutes, and distinct teaching days
- Session-based planned-to-taught completion for the closed period
- Past Sessions still marked Scheduled, future Scheduled Sessions, cancelled Sessions, and ready unscheduled Plans
- Active Assessment Evidence records, distinct learners with Evidence, Evidence kind distribution, and current retained roster coverage
- Completed teaching activity by Class, Group, Individual, and individual context
- Current explicit active Standard alignments on active Plans
- Current explicit Plan and Lesson Flow Library content links
- Managed Focus, Purpose, and Theme category assignments
- Transparent Needs Review record-integrity rules

All percentages display their numerator and denominator or an explicit unavailable state.

## Historical and deletion limits

Insights reports the canonical records currently retained in DB v16. It does not reconstruct permanently deleted Plans, Sessions, Calendar Events, Tasks, or roster memberships from the Undo change log.

Current Plan content and Standard alignments are planning facts. They are not presented as immutable evidence of what was used or taught in an earlier completed Session.

Archived contexts retain their completed Session history. Cancelled Sessions remain separate from the planned-to-taught denominator. Archived Evidence is excluded from primary coverage. Archived Library sources can remain visible as explicit retained links.

## Architecture

```text
DB v16 canonical tables
  → TeachingInsightsReadService (single read-only transaction + Zod validation)
  → buildTeachingInsightsView (pure derived model)
  → useTeachingInsights (live-query state)
  → TeachingInsightsDashboard / InsightsRoute
```

Malformed canonical rows cause an explicit load error instead of being silently dropped. Valid records with missing or inconsistent relationships are surfaced through source-linked Needs Review rules.

## Accessibility and responsive behavior

- The School Year selector uses an explicit label association.
- Named sections and semantic definition lists expose metric structure.
- Tables are contained in labeled, keyboard-focusable horizontal scroll regions.
- Status is not communicated by color alone.
- The 390px layout avoids page-level horizontal overflow.
- Chromium E2E covers metric semantics, source traces, URL state, responsive behavior, and axe checks.
- Personal Pilot Readiness loads the dashboard in both Chromium and WebKit.

## Deferred work

The following remain outside Phase 4A-1:

- historical roster reconstruction
- immutable completed-Session content or Standard snapshots
- learner progress, mastery, grades, or ranking
- teacher or context effectiveness scoring
- attendance and engagement analytics
- Calendar, Schedule adherence, or Task productivity analytics
- cross-year comparison and custom date ranges
- persisted analytics, AI summaries, or recommendations
