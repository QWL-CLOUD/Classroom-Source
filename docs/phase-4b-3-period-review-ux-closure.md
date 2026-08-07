# Phase 4B-3 — Period Review & UX Closure

Phase 4B-3 closes the first Teaching Review workflow without adding a new persistence domain.

## Product boundary

Teaching Review remains a read-only derived workspace. Selecting a period changes which dated
teaching follow-up records are shown; it does not save reviewed/dismissed state, create Tasks,
change source records, score teaching, infer learner mastery, or analyze Reflection narrative.

## Review periods

The route supports URL-backed:

- School Year (default)
- This Week
- Last Week
- Custom (`from` / `to`)

Weeks are Monday through Sunday using Classroom's local-date utilities. Custom ranges must be valid
inclusive local dates. When the School Year changes, an overlapping Custom range is clipped to the
new School Year; a non-overlapping Custom range falls back to School Year.

## Queue scope

The following queues follow the selected teaching period:

- Awaiting Reflection — by completed Session date
- Past still Scheduled — by Session date
- Open Next Steps — by the originating Reflection / completed Session date

Record Issues remain School Year-wide. Many integrity rules refer to Standards, Library items,
category assignments, contexts, or other records that do not have a meaningful occurrence date.
Filtering those issues into an arbitrary week would create false temporal semantics.

No Evidence-gap queue is introduced. Assessment Evidence review remains Phase 4D.

## Return navigation

Review source links carry the selected period in explicit `reviewPeriod`, `reviewFrom`, and
`reviewTo` parameters. AppShell, Session, Planning, Reflection, Tasks, Standards, and Library return
paths reconstruct the Review route with its School Year, queue, source focus, and period.

If a source mutation resolves the focused queue row, the existing queue-heading fallback remains in
force.

## Data and version impact

- App version: `20.0.0-pilot.1` retained
- Database schema: v17 retained
- Portable Backup schema: v17 retained
- Teaching Insights view contract: v2 retained
- Teaching Review contract: v1 retained
- no new table
- no new mutation service
- no persisted review state

`TeachingInsightsReadService` exposes a read-only Session ID → local date index alongside its v2
view so Teaching Review can period-filter Past still Scheduled without changing Teaching Insights
metric semantics.
