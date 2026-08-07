# Classroom v20 Source

A local-first teaching workspace for personal instructional planning, scheduling, learner support,
assessment evidence, reusable content, and controlled data imports.

**Owner:** Alyssa

**Credit:** Designed by Alyssa × ChatGPT

This repository is the React + TypeScript source rebuild of Classroom. The legacy
`QWL-CLOUD/Classroom` repository remains a frozen product and data-format reference.

## Current status

- App version: `20.0.0-pilot.1`
- Database schema: v17
- Portable backup schema: v17
- Personal-pilot closure: runtime recovery, privacy-safe System Health diagnostics, recurrence-safe
  School Year deletion, and Chromium/WebKit readiness
- Teaching Insights v2: read-only, source-linked teaching metrics with explicit data-contract
  boundaries and source drill-down
- Teaching Reflection: persistent completed-Session reflections with Task-based Next Steps;
  reflection narrative remains teacher-authored and is not analyzed or scored
- Teaching Review v1: read-only, source-linked follow-up queues derived from Teaching Insights facts
  without persisted reviewed state or automatic mutation
- Teaching Review drill-down: exact Standard, Library item, Task, Session, Plan, and Reflection
  navigation with explicit return-to-review state
- Learner Progress v1: Student, Context, and Standard Evidence review with URL-backed periods,
  exact Evidence detail, teacher-controlled Evidence lifecycle, and explicit source-return navigation

The current pilot includes:

- Today, Week, Calendar, Personal Agenda, Tasks, and Reminders
- Classes, Groups, Individuals, learner rosters, learner notices, and learner services
- Lesson Plans, Lesson Flow, Lesson Series, Session occurrences, and occurrence-first planning
- Library Activities, Resources, Assessments, Lesson Templates, Standards, and managed categories
- Canonical Assessment Evidence linked to stable Student records
- Read-only Teaching Insights with teaching activity, planning completion, Evidence coverage,
  context distribution, Standards/Content links, Reflection coverage, Next Step status, and Needs Review
- Session-linked Teaching Reflection with teacher-authored narrative and ordinary Task-based Next Steps
- Read-only Teaching Review queues for awaiting Reflection, Past still Scheduled, open Reflection
  Next Steps, and remaining record-integrity issues
- Learner Progress timelines and Evidence editing that keep Score, Proficiency, and Observation
  distinct, preserve historical source snapshots, and never infer grades or mastery
- Canonical Import Center for rosters, Standards, Activities, Resources, Assessments, and Calendar
  Events
- CSV/XLSX templates and reviewed import workflows
- ICS Calendar Event import, including supported recurrence rules, RDATE/EXDATE, moved/cancelled
  occurrences, source reconciliation, and atomic Undo/Redo
- School Year rollover and guarded lifecycle actions
- Portable Backup & Recovery with legacy-schema validation and safety snapshots
- Persistent global Undo/Redo for supported mutations
- Responsive navigation and accessibility checks

## Local-first boundary

Classroom stores user records in the browser's `classroom-v20` IndexedDB database. It does not
provide cloud sync, accounts, shared calendars, background uploads, or multi-user visibility.
Portable backups are the primary recovery mechanism. “Local-first” does not mean that the deployed
application assets are available offline; no service worker or PWA cache is included in this pilot.

## Main routes

- `#/today?date=YYYY-MM-DD`
- `#/week?date=YYYY-MM-DD`
- `#/calendar?date=YYYY-MM-DD`
- `#/agenda?date=YYYY-MM-DD`
- `#/tasks`
- `#/learners`
- `#/planning/edit`
- `#/planning/session`
- `#/insights`
- `#/teaching-review`
- `#/learner-progress`
- `#/library`
- `#/templates`
- `#/standards`
- `#/categories`
- `#/import`
- `#/migration`
- `#/export`
- `#/settings`
- `#/settings/rollover`
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
npx playwright install chromium webkit
npm run test:e2e
```

The full Playwright suite runs in Chromium. The dedicated Personal Pilot Readiness scenarios also
run in WebKit to protect Safari-relevant IndexedDB persistence, downloads, storage capability
handling, focus, responsive navigation, and critical accessibility behavior.

See [`docs/testing.md`](docs/testing.md) and
[`docs/personal-pilot-closure.md`](docs/personal-pilot-closure.md).

## Recovery and diagnostics

- **Backup & Recovery** exports the complete portable v17 user dataset and validates restores before
  atomic replacement.
- **System Health** reports the app/database version, active School Year count, browser storage
  status, and compact workspace counts.
- The downloadable System Health diagnostic contains counts and statuses only. It excludes record
  content, names, IDs, file paths, and raw imported data.
- The root Error Boundary provides safe reload, System Health, and Backup & Recovery actions if an
  unexpected render failure occurs.

## Migration safety

- Legacy `cos-*` localStorage is read-only.
- Migration writes occur in a single IndexedDB transaction.
- Quarantined records remain outside active Calendar, Week, and Today queries.
- Rollback removes only migration-created records that were not subsequently modified.
- Never delete or overwrite legacy browser data automatically.

## Privacy

Do not place real backups, learner data, schedules, copyrighted standards, school calendars, or
imported files in this repository. Keep them in a separate private folder and select them only
through the browser's local file picker.
