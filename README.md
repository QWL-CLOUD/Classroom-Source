# Classroom v20 Source

A local-first teaching workspace.

**Owner:** Alyssa  
**Credit:** Designed by: Alyssa × ChatGPT

This repository is the React + TypeScript source rebuild of Classroom. The legacy `QWL-CLOUD/Classroom` repository remains a frozen product and data-format reference.

## Current status

- App version: `20.0.0-alpha.0`
- Phase 0: source foundation complete
- Phase 1B–1E: private legacy migration, rollback, and acceptance complete
- Phase 2A–2F: repository-backed views and controlled Calendar editing complete
- Phase 2 completion audit: automated closure complete; private real-data acceptance remains a local browser check
- Phase 3C-1–3C-6: Planning/Session lifecycle, Lesson Flow, Lesson Series ordering and Bump,
  learner lifecycle, occurrence-first planning, safe deletion, and lifecycle closure complete
- Phase 3D-1–3D-4: Task lifecycle, source-linked Reminders, Learner Support & Notices, and the
  real-time Personal Agenda aggregation complete
- Phase 3D-5B-1: global shell and responsive foundation adds a mobile navigation drawer,
  route-aware content widths, shared editor headers, and sticky editor actions

## Phase 2 capabilities

- Repository-backed reads from the `classroom-v20` IndexedDB database
- Calendar month view combining recurring Schedule Blocks and dated Calendar events
- Monday–Sunday Week view with weekends, parent/child blocks, cross-day events, and duplicate suppression
- Today timeline with All day, Past, Now, and Upcoming states
- Learners views for Classes, Groups, and Individuals with Upcoming, Unscheduled, and Completed planning
- Validated create, edit, and delete flows for dated Calendar events
- Transactional change log with global Undo and Redo
- Hash Router URLs compatible with the GitHub Pages `/Classroom-Source/` base path
- Lesson Series management with rename, archive/restore, container-only deletion, and compound
  Undo/Redo that preserves Plans, Sessions, and completed teaching history

## Main routes

- `#/today?date=YYYY-MM-DD`
- `#/week?date=YYYY-MM-DD`
- `#/calendar?date=YYYY-MM-DD`
- `#/agenda?date=YYYY-MM-DD`
- `#/calendar/edit?date=YYYY-MM-DD`
- `#/learners`
- `#/migration`
- `#/system-health`

## Local setup

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

## Required checks

```bash
npm run format
npm run check
npx playwright install chromium
npm run test:e2e
```

Pull-request CI runs formatting, linting, TypeScript, unit tests, the privacy scan, production build verification, and Chromium Playwright tests.

## Migration safety

- Legacy `cos-*` localStorage is read-only.
- Migration writes occur in a single IndexedDB transaction.
- Quarantined records remain outside active Calendar, Week, and Today queries.
- Rollback only removes records created by the migration and not subsequently modified.
- Do not delete or overwrite the legacy browser data automatically.

## Private real-data acceptance

The public repository cannot inspect a user's local IndexedDB contents. Complete the privacy-safe checklist in [`docs/PHASE_2_COMPLETION_AUDIT.md`](docs/PHASE_2_COMPLETION_AUDIT.md) in the same browser profile that contains the migrated data.

## Privacy

Do not place real backups, learner data, schedules, copyrighted standards, school calendars, or imported files in this repository. Keep them in a separate private folder and select them only through the browser's local file picker.
