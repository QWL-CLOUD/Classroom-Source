# Testing Strategy

Classroom uses layered automated and manual validation. Test totals are intentionally not fixed in
this document because they change as the product grows.

## Quality pipeline

`npm run check` runs, in order:

1. Prettier verification
2. ESLint
3. TypeScript project type checking
4. Vitest
5. the public-source privacy scan
6. the production build
7. built-artifact verification

Vitest and React Testing Library cover domain schemas, read models, mutation services, migration and
restore validation, recurrence expansion/reconciliation, persistent Undo/Redo, accessibility-aware
components, and storage/error fallback behavior. `fake-indexeddb` is used for real Dexie schema and
transaction tests.

Backup/Restore unit coverage includes current v17 Assessment Evidence and Teaching Reflection
round-trips, legacy schema compatibility, transactional rollback on synthetic write failure, and the
five-snapshot retention bound across repeated restores.

## Playwright projects

- **Chromium:** runs the complete E2E suite, including navigation, planning, Calendar, imports,
  Backup/Restore, lifecycle guards, responsive behavior, accessibility checks, current pilot
  cross-workflow acceptance, and a deterministic multi-year data-volume regression. Teaching Insights
  has explicit page- and card-overflow regression coverage at 390px and intermediate/desktop widths
  (1024px, 1180px, 1280px, and 1440px), including its nested Standards and Content comparison cards.
  Teaching Review E2E coverage verifies URL-backed School Year and review-period selection, queue
  semantics, source drill-down/return state, exact Standard/Library/Task focus, Reflection-linked Task
  filtering, period preservation through source returns, no hidden Evidence-gap queue, 390px page
  containment, and automated accessibility. Learner Progress E2E coverage verifies
  Student/Context/Standard Evidence views, URL-backed period/lifecycle/kind and
  Assessment/Standard/Session source filters, chronology, exact Evidence selection, retained
  historical source snapshots, safe current-retained-roster coverage, historical School Year
  non-reconstruction, teacher-controlled create/edit/archive/restore, School Year date guards,
  direct workflow entry points, exact source return navigation, nested Teaching Review return state,
  mobile containment, and automated accessibility. Reports E2E protects learner/year/period scope,
  recorded-Evidence-only presentation, CSV/print output, historical provenance, and mobile/a11y
  behavior.
- **WebKit pilot:** runs only `personal-pilot-readiness.spec.ts`. It protects the Safari-relevant
  current personal-pilot path without duplicating every historical Chromium scenario.

The current WebKit pilot specification covers:

- creating the first active School Year;
- IndexedDB persistence after reload;
- System Health app/database readiness and browser storage capability presentation;
- privacy-safe diagnostic download and portable backup download;
- Today, Calendar, Teaching Reflection, Teaching Insights, Teaching Review, Learner Progress, and
  Reports at 390px without page overflow;
- responsive navigation focus and critical automated accessibility violations;
- the daily closeout handoff from Session completion through Session Evidence and optional Teaching
  Reflection back to Today;
- Learner Progress → learner-scoped Reports → CSV export without inferred judgment.

`personal-pilot-long-running.spec.ts` is Chromium-only. It seeds a deterministic three-School-Year,
24-Student synthetic workspace with hundreds of Sessions and Evidence records and verifies that
Today, Week, Learner Progress, Reports, System Health, portable Backup, reload, and historical-year
Reports remain functional. It intentionally asserts outcomes rather than wall-clock timing so CI is
not turned into a flaky performance benchmark.

Backup & Recovery browser coverage also rejects malformed JSON and integrity-tampered backups before
any write state is created.

Install both browsers before the E2E run:

```bash
npx playwright install chromium webkit
npm run test:e2e
```

For a clean local pilot acceptance run, use zero retries explicitly:

```bash
npx playwright test tests/e2e/personal-pilot-readiness.spec.ts --project=chromium --retries=0
npx playwright test tests/e2e/personal-pilot-readiness.spec.ts --project=webkit-pilot --retries=0
npx playwright test tests/e2e/personal-pilot-long-running.spec.ts --project=chromium --retries=0
```

CI and the GitHub Pages deployment both run the full Chromium suite and the WebKit pilot project.
Deployment is blocked if either project fails. CI retries are diagnostic and do not replace a clean
first-attempt local acceptance run.

## Manual acceptance

Automated tests cannot inspect a user's private browser data or establish that Safari retained data
across a real browser restart. Before a personal-pilot release, complete the manual checklist in
[`personal-pilot-closure.md`](personal-pilot-closure.md), including Backup/Restore, current
Session-closeout/Progress/Reports journeys, recurrence-owned School Year deletion protection,
desktop/mobile review, and a real Safari pilot pass.

System Health tests must use repository data and the privacy-safe report contract. They must not
infer business correctness by scanning unrelated visible text.
