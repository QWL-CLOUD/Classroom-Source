# Classroom v20 Phase 3A — Schedule Block Controlled Editing

## Scope

This source-only package adds safe create, edit, and archive workflows for recurring
Schedule Blocks.

It adds:

- `#/schedule/edit` and `#/schedule/edit?id=<schedule-block-id>`;
- Monday-through-Sunday recurrence editing;
- title, category, kind, weekdays, start/end time, effective dates,
  `showInWeek`, and parent editing;
- parent self-reference and cycle prevention;
- archive protection when active child blocks still exist;
- Zod validation before every write;
- one Dexie transaction for each Schedule Block mutation and its change log;
- a shared Calendar/Schedule command registry;
- global Undo/Redo across both entity types, including reload persistence;
- live Calendar, Week, and Today synchronization through the existing repository reads;
- Calendar and Week **Manage schedule** entry points;
- unit, repository, Playwright, Friday/weekend, parent/child, reload, and axe coverage.

It does **not** add all-day Schedule Blocks, source editing, occurrence exceptions,
This-and-future splitting, Bump, Lesson Plan editing, Session editing, a Dexie version,
or migration changes.

## Base

This package is intentionally bound to:

```text
786bab69cd0cdeeedd14dd8469faf7127a53a492
```

The installer stops if `HEAD` differs. Do not force it onto a newer or older baseline.

## Apply

From the local repository root:

```bash
git switch main
git pull --ff-only
git switch -c phase-3a-schedule-block-editing
```

Place the extracted folder `Classroom-v20-Phase-3A-Schedule-Block-Editing` in the
repository root, then run:

```bash
bash Classroom-v20-Phase-3A-Schedule-Block-Editing/apply-phase-3a.sh
```

The installer:

- refuses to run on `main`;
- requires the exact audited base commit;
- refuses tracked uncommitted changes;
- verifies source anchors before writing;
- removes its own package folder after applying;
- never touches `dist`, database schema versions, migration code, or legacy `cos-*` data.

## Validate

```bash
npm run format
npm run check

lsof -ti tcp:4173 | xargs kill -9 2>/dev/null || true
rm -rf test-results playwright-report
npm run test:e2e
```

Expected new automated coverage from this package:

- 6 additional Vitest files;
- 15 additional unit/repository tests;
- 1 additional Playwright spec with 2 scenarios;
- expected Playwright total: **14 passed**.

The complete repository totals must be taken from the actual local run, not from the
package prevalidation environment.

## Private real-data acceptance

Use the browser profile containing the migrated v20 IndexedDB. Do not export or upload
that data.

1. Open Calendar or Week and choose **Manage schedule**.
2. Select the existing Monday–Thursday Dismissal record.
3. Turn on **Show in Week** and save.
4. Confirm Dismissal appears Monday through Thursday in Week.
5. Use global Undo and confirm it hides.
6. Reload, use Redo, and confirm it returns.
7. Confirm Calendar and Today remain readable.
8. Do not put the record ID, screenshots, backups, or browser exports in Git.

## Commit

After every check passes:

```bash
git status
git add src tests
git commit -m "Implement Phase 3A Schedule Block editing"
git push -u origin phase-3a-schedule-block-editing
```

Open a pull request into `main`. Merge only after CI and Pages are green.
