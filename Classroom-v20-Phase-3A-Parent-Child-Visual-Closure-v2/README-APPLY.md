# Classroom v20 — Phase 3A Parent–Child Visual Closure v2

This source-only package applies the parent/child visual closure on top of the
completed Phase 3A main baseline.

## Required baseline

- Repository: `QWL-CLOUD/Classroom-Source`
- Commit: `93305f3ad369cb9ed3ada005a61100e09e563dba`
- Required branch: `phase-3a-parent-child-visual-closure`

The installer stops before writing when the branch, commit, tracked working tree,
or source anchors do not match.

## Included scope

- Stable parent-first hierarchy in the Schedule Block manager.
- Child indentation and `Part of …` labels.
- Direct child counts on parent records.
- Shared low-saturation group tones.
- Orphan records remain visible as `Parent unavailable`.
- Parent choices exclude the current block and all descendants.
- Parents with active children show a disabled Archive action and guidance.
- Week, Today, and Calendar receive consistent hierarchy metadata and visual cues.
- Today keeps the time rail fixed while only child content is indented.
- Unit and Playwright coverage for hierarchy, Friday/weekend-compatible data,
  orphan safety, ordering, accessibility, and cross-view rendering.

## Explicitly not included

- Schedule Exceptions or Phase 3B code.
- Dexie schema/version changes.
- Migration, rollback, quarantine, or legacy `cos-*` changes.
- Drag-and-drop, collapsible trees, or manual child ordering.
- Lesson Plans, SessionOccurrence editing, or Bump.
- `dist` or private Classroom data.

## Apply

```bash
cd "/Users/alyssali/Documents/Classroom Development/Classroom-Source-git"

git fetch origin --prune
git switch main
git pull --ff-only
git rev-parse --short HEAD
```

The commit must be `93305f3`.

```bash
git switch -c phase-3a-parent-child-visual-closure 2>/dev/null || \
git switch phase-3a-parent-child-visual-closure
```

Place or extract this folder in the repository root, then run:

```bash
bash Classroom-v20-Phase-3A-Parent-Child-Visual-Closure-v2/apply-parent-child-visual.sh
```

Successful output ends with:

```text
Parent–Child Visual Closure source files applied successfully.
Base commit: 93305f3ad369cb9ed3ada005a61100e09e563dba
No schema, migration, exception, dist, legacy storage, or private data files were changed.
```

The installer folder removes itself after a successful application, preventing
Vitest from scanning package payload files.

## Validate

```bash
npm run format
npm run check

lsof -ti tcp:4173 | xargs kill -9 2>/dev/null || true
rm -rf test-results playwright-report
npm run test:e2e
```

Expected baseline after installation:

- Vitest: 28 files, 104 tests passed.
- Playwright: 16 passed.

Run `npm run build` before a targeted Playwright rerun whenever source or CSS was
changed after the last build.

## v2 installer correction

The Week-route hierarchy insertion accepts the existing Prettier blank line between the focused-item declaration and the return statement, while still requiring exactly one match.
