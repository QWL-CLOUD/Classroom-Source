# Global Floating Controls & Menus Repair

## Baseline

- `main`: `9ed33c5baddbbe5c82e2e84933ff9fc06f6c893d`
- branch: `repair-global-floating-controls-menus`
- quality baseline before repair: Vitest 64 files / 247 tests; Playwright 47 / 47

## Problems closed

1. Learner directory cards displayed a decorative three-dot icon with no menu.
2. Shared Add menus and editor More menus used independent native `<details>`
   behavior without outside-click dismissal, one-menu-at-a-time behavior, or
   viewport collision handling.
3. The translucent sticky topbar allowed page controls scrolling underneath it
   to remain visible, making Add appear to overlap Undo/Redo.
4. Menu panels had no shared viewport-bounded maximum height.

## Repair

- Adds a shared dismissible `<details>` controller.
- Outside pointer closes the open menu.
- Escape closes and restores focus to the summary.
- Opening one managed menu closes another.
- Menus choose top or bottom placement from available viewport space.
- Panels receive a bounded, scrollable maximum height.
- Shared Workspace Add and Editor Action menus use the controller.
- Learner Add, selected-context More, and directory-card More menus use the same behavior.
- Directory More exposes Planning, Support & Notices, and Details & Lifecycle.
- The sticky topbar is opaque so normal page content cannot visually bleed through it.
- No database, domain, routing, or destructive lifecycle behavior changes.

## Non-goals

- No Library or Standards implementation.
- No redesign of Today, Week, Calendar, Agenda, Tasks, or Learners.
- No direct destructive Archive/Delete commands in the directory overflow menu;
  lifecycle actions remain in the protected Details workflow.
