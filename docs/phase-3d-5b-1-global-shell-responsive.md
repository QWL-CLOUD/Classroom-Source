# Phase 3D-5B-1 — Global Shell & Responsive Foundation

This slice establishes shared interface infrastructure before page-specific Workspace polish.
It does not change Classroom records, mutations, or IndexedDB schema.

## Mobile navigation

- The permanent narrow-screen sidebar is replaced by an overlay navigation drawer.
- The drawer opens from the top bar, closes through its close button, backdrop, route selection, or
  Escape, and returns focus when dismissed directly.
- Background page scrolling is locked while the drawer is open.
- Desktop keeps the existing collapsible sidebar.

## Top bar and content layouts

The unfinished disabled global Search field is removed. The top bar now shows the current route and
retains persistent global Undo/Redo controls.

AppShell assigns one of four route-aware content layouts:

- `standard` — Today, Agenda, Tasks, Learners, Library, and Insights
- `editor` — Planning, Session, Schedule, occurrence, and Calendar Event editors
- `wide` — Week and Calendar
- `reading` — Import, Migration, Export, Settings, and System Health

These layouts provide consistent maximum widths without constraining Week or Calendar.

## Editor foundation

Shared visual foundations are added for:

- editor page headers;
- sticky editor action bars;
- primary, danger, and quiet button hierarchy;
- status, type, and count badges.

The sticky action bar is connected to Planning, Session, Schedule Block, Schedule occurrence, and
Calendar Event editing. Save remains available during long-form scrolling while the normal flow
reserves space for the action area.

## Safety

- No data-model changes
- No database-version upgrade
- No new UI framework
- No change to global Undo/Redo or source mutation services
- No Today, Week, Calendar, Task, Learner, or Agenda business-rule changes
