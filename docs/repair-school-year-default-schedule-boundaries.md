# School Year × Default Schedule Boundary Repair

## Baseline

- `main`: `6d269b849b3c5f04bfdf7fb10e361d4e9056b34f`
- branch: `repair-school-year-default-schedule-boundaries`

## Behavior

- School Year `startsOn` and `endsOn` are inclusive.
- Recurring default Schedule Blocks are not expanded before `startsOn` or
  after `endsOn`.
- When no active School Year exists, recurring Schedule Blocks remain
  unbounded so existing schedules do not disappear during initial setup.
- An explicit ScheduleException with action `add` remains visible outside the
  School Year because it is a dated addition.
- Dated SessionOccurrences and CalendarEvents remain visible outside the
  School Year.
- Existing cancellation and modification behavior remains unchanged inside
  the School Year.
- Today, Week, and Calendar use the same shared boundary helper.
- Updating the active School Year refreshes the three routes through the
  existing live-query subscription.
- Week's `showWeekends` setting remains view-only and is not used as a
  schedule-generation rule.

## Out of scope

- Saturday/Sunday school-day settings
- Learner Service recurrence
- deletion or mutation of ScheduleBlock records
- Library Catalog work
