# Classroom v20 Source

A local-first teaching workspace.

**Owner:** Alyssa  
**Credit:** Designed by: Alyssa × ChatGPT

This repository is a clean React + TypeScript rebuild. The legacy `QWL-CLOUD/Classroom` repository
remains a frozen product and data-format reference.

## Phase 0 included

- React + TypeScript + Vite source project
- Hash Router and stable source routes
- Classroom app shell and visual tokens
- IndexedDB / Dexie database named `classroom-v20`
- Zod domain schemas
- Read-only legacy backup envelope scanner
- Shared Today/Tasks IndexedDB smoke test
- System Health foundation page
- Vitest, React Testing Library, Playwright, and axe-core
- privacy scan and GitHub Actions Pages deployment

## Local setup

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

## Required checks

```bash
npm run check
npx playwright install chromium
npm run test:e2e
```

## GitHub Pages

The production build uses `/Classroom-Source/` as its base path and Hash Router for client routes.
In repository **Settings → Pages**, choose **GitHub Actions** as the publishing source.

## Privacy

Do not place real backups, learner data, schedules, copyrighted standards, school calendars, or
imported files in this repository. Keep them in a separate private folder and select them only through
the browser's local file picker.
