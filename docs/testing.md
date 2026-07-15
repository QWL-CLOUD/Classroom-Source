# Testing Strategy

- **Vitest:** local-date rules, Zod schemas, recurrence rules, migration normalization, command logic
- **React Testing Library:** URL-driven pages and shared-record behavior
- **fake-indexeddb:** Dexie transactions and schema upgrades
- **Playwright:** route history, reload, Week controls, migration preview, planning, bump, undo/redo
- **axe-core:** baseline accessibility checks
- **GitHub Actions:** format, lint, typecheck, tests, privacy scan, build, smoke tests, deploy

No System Health test is allowed to infer business correctness by scanning visible DOM text.
