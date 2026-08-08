# Personal Pilot Closure

## Release identity

- App version: `20.0.0-pilot.1`
- Database schema: v17
- Portable backup schema: v17
- Intended use: one teacher's controlled local browser profile
- Current hardening baseline: post-Phase-4F product surface

The personal pilot now includes Teaching Insights, Teaching Reflection, Teaching Review, Learner
Progress, Session closeout handoff, and Teacher Reports in addition to the earlier planning,
scheduling, import, recovery, and local-data workflows. Phase 4G does not add a business domain or
migration; it refreshes the reliability contract around the product that already exists.

## Release checklist

Before merging or deploying the pilot:

- `npm run check` passes.
- The complete Chromium Playwright suite passes without a required retry.
- `personal-pilot-readiness.spec.ts` passes in Chromium and WebKit without a required retry.
- `personal-pilot-long-running.spec.ts` passes in Chromium.
- Backup/Restore failure-path and safety-snapshot regression tests pass.
- The working tree contains only the reviewed release scope.
- The privacy scan and production build verification pass.
- The GitHub Pages deployment check passes before merge.
- A fresh portable backup is downloaded before first use and after meaningful data entry.

## Manual QA

1. Open a fresh browser profile and create the first active School Year from the prefilled editor.
2. Reload and confirm the School Year and shell context persist.
3. Confirm System Health shows app `20.0.0-pilot.1`, DB v17 Ready, and an appropriate browser-storage
   state.
4. Download the System Health report. Confirm it contains counts/statuses but no School Year names,
   learner names, Event titles, IDs, file paths, or raw records.
5. Download a full v17 backup and confirm its app version and database schema.
6. Preview and restore one valid v17 backup and one supported older backup. Confirm the pre-restore
   safety snapshot and atomic replacement behavior. Confirm malformed/tampered files create no
   restore preview and do not change current data.
7. Create recurrence ownership with no materialized Event and confirm its School Year cannot be
   deleted.
8. Complete a daily-origin Session and verify the closeout path remains continuous: Session Evidence
   → Learner Progress → Back to Session → optional Teaching Reflection → return to the daily surface.
9. Open Teaching Review and confirm its queues remain read-only/source-linked. Open Learner Progress,
   drill into exact Evidence/source records, and return without losing the selected School Year and
   filter scope.
10. From a selected learner in Learner Progress, open Reports. Confirm the learner/year/period scope,
    CSV download, and print representation contain recorded Evidence only and do not claim mastery,
    grades, readiness, rank, growth, or missing Evidence.
11. Review Today, Week, Calendar, Learners, Teaching Insights, Teaching Review, Learner Progress,
    Reports, Import Center, Backup & Recovery, Settings, and System Health at desktop width and 390px
    mobile width.
12. Exercise the Error Boundary through the test/development path and confirm every recovery action
    is keyboard accessible.
13. Complete the first-run, closeout, Progress, Reports/CSV, diagnostic, backup, reload, and mobile
    checks in real Safari after the automated WebKit pilot project passes.

## Diagnostic support workflow

When a problem occurs:

1. Avoid clearing browser storage or reinstalling the application.
2. Open System Health and download the privacy-safe diagnostic report.
3. Open Backup & Recovery and download a full portable backup if the application remains usable.
4. Record the route, visible action, expected result, actual result, and browser version.
5. Share the diagnostic report and reproduction steps. Keep the full backup private unless its
   contents are intentionally needed for local recovery work.

The diagnostic report includes versions, table counts, storage status, and explicit privacy flags.
It excludes record content, names, IDs, file paths, and imported source data.

## Rollback and recovery rules

- Prefer global Undo immediately after a supported accidental mutation.
- Use Backup & Recovery for broader rollback or cross-version recovery.
- Restore always validates the file before writing and creates a pre-restore safety snapshot.
- Only the five most recent safety snapshots are retained in the browser; restore-run history is
  separate.
- Do not edit backup JSON manually; integrity validation will reject modified content.
- Do not delete the `classroom-v20` IndexedDB database while investigating a problem.
- Do not remove the active School Year to “reset” the app. Create or restore the intended data
  instead.
- GitHub source rollback does not roll back browser data. Application code and local IndexedDB data
  must be treated as separate recovery surfaces.

## Known limitations

- Data is local to one browser origin/profile; there is no account, cloud sync, or shared visibility.
- Browser storage may remain best-effort even after a persistence request. Portable backups are still
  required.
- No service worker or PWA cache is provided, so deployed assets are not guaranteed offline.
- Teaching Insights, Teaching Review, Learner Progress, and Reports are descriptive/source-linked;
  they do not infer grades, mastery, readiness, learner rank, or a universal progress score.
- WebKit validation covers the personal-pilot critical path, not every historical E2E scenario.
- The long-running synthetic regression is a functional volume guard, not a browser-performance SLA.
- Unsupported or ambiguous ICS recurrence rules remain blocked rather than approximated.
- The Error Boundary handles React render failures; it cannot recover from every browser, extension,
  storage-engine, or device failure.
