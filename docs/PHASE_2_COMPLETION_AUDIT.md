# Phase 2 Completion Audit

**Automated status:** PASS  
**Private real-data acceptance:** USER-RUN LOCAL CHECK  
**Public repository privacy status:** No private records are required or stored by this checklist.

## Completed automated scope

- Phase 2A: repository-backed read models
- Phase 2B: Calendar read view
- Phase 2C: Week read view
- Phase 2D: Today read view
- Phase 2E: Learners read view
- Phase 2F: controlled dated Calendar-event editing with Zod validation, Dexie transactions, change log, Undo, and Redo
- Calendar provides a discoverable `Manage events` entry point
- Pull-request CI runs Chromium Playwright tests
- Hash Router navigation, reload behavior, and axe checks are covered by E2E tests

## Privacy-safe migration baseline

The accepted migration report recorded the following initial counts:

| Table                | Accepted baseline |
| -------------------- | ----------------: |
| `schoolYears`        |                 1 |
| `scheduleBlocks`     |                40 |
| `calendarEvents`     |                33 |
| `learnerContexts`    |                 2 |
| `quarantineRecords`  |                17 |
| `lessonPlans`        |                 0 |
| `sessionOccurrences` |                 0 |
| Legacy `cos-*` keys  |                40 |

Counts may legitimately increase after the user creates new Calendar events or other supported records. The application must never reduce or overwrite the legacy `cos-*` baseline automatically.

## Local real-data acceptance checklist

Run these checks in the same browser profile and origin that contain the migrated v20 IndexedDB data.

1. Open `#/system-health` and confirm the expected core tables are present. User-created records may make counts higher than the accepted baseline.
2. Open Calendar on a month containing migrated data. Confirm dated events and recurring Schedule Blocks both appear.
3. Select **Manage events**. Confirm the editor keeps the selected date and **Back to Calendar** returns to the same month.
4. Open Week on a week containing migrated data. Confirm Monday–Sunday composition, Friday rendering, and weekend visibility.
5. Open Today on a date containing migrated data. Confirm timeline and Reminders use the selected date.
6. Use **View in Week** from Today or Learners and confirm the date is preserved.
7. Open Learners and confirm the active Class, Group, or Individual contexts appear. Empty planning tabs are expected when no lesson plans or session occurrences were migrated.
8. Confirm quarantined records do not appear in Calendar, Week, or Today.
9. Create a synthetic Calendar event that contains no private information. Confirm Calendar, Week, and Today update where applicable.
10. Test Edit, Delete confirmation, Undo, Redo, and browser reload. Remove the synthetic event when finished.
11. Refresh direct hash routes and use browser Back/Forward. Confirm the route and selected date survive.
12. Confirm the legacy `cos-*` keys remain present and unchanged.

## Remaining post-Phase-2 work

These items are outside the Phase 2 closure patch:

- Confirm the real 2026–2027 school-year boundaries.
- Classify the remaining planning record from migration review.
- Design schemas for deferred Library and Standards records.
- Manually review quarantined records without exposing them publicly.
- Decide how to handle legacy store keys outside the completed migration phase.
- Consider route-level code splitting before the main bundle grows further.
