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

## Playwright projects

- **Chromium:** runs the complete E2E suite, including navigation, planning, Calendar, imports,
  Backup/Restore, lifecycle guards, responsive behavior, and accessibility checks. Teaching Insights
  has explicit page- and card-overflow regression coverage at 390px and intermediate/desktop widths
  (1024px, 1180px, 1280px, and 1440px), including its nested Standards and Content comparison cards.
  Teaching Review E2E coverage verifies URL-backed School Year and review-period selection, queue
  semantics, source drill-down/return state, exact Standard/Library/Task focus, Reflection-linked
  Task filtering, period preservation through source returns, no hidden Evidence-gap queue, 390px
  page containment, and automated accessibility. Learner Progress E2E coverage verifies read-only
  Student/Context/Standard Evidence views, URL-backed period/lifecycle/kind state, exact Evidence
  selection, retained historical source snapshots, teacher-controlled create/edit/archive/restore,
  School Year date guards, exact source return navigation, nested Teaching Review return state,
  mobile containment, and automated accessibility.
- **WebKit pilot:** runs only `personal-pilot-readiness.spec.ts`. It protects the Safari-relevant
  personal-pilot path without duplicating every historical Chromium scenario.

The pilot specification covers:

- creating the first active School Year;
- IndexedDB persistence after reload;
- System Health app/database readiness;
- browser storage capability presentation;
- privacy-safe diagnostic download;
- portable backup download;
- core mobile routes without horizontal overflow;
- responsive navigation focus;
- no critical automated accessibility violations.

Install both browsers before the E2E run:

```bash
npx playwright install chromium webkit
npm run test:e2e
```

CI and the GitHub Pages deployment both run the full Chromium suite and the WebKit pilot project.
Deployment is blocked if either project fails. CI retries are diagnostic and do not replace a clean
first-attempt local acceptance run.

## Manual acceptance

Automated tests cannot inspect a user's private browser data or establish that Safari retained data
across a real browser restart. Before a personal-pilot release, complete the manual checklist in
[`personal-pilot-closure.md`](personal-pilot-closure.md), including Backup/Restore, recurrence-owned
School Year deletion protection, desktop/mobile review, and a real Safari pilot pass.

System Health tests must use repository data and the privacy-safe report contract. They must not
infer business correctness by scanning unrelated visible text.
