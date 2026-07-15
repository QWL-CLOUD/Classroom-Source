# Data Model Foundation

The Phase 0 database includes stable tables for school years, learner contexts, recurring schedule
blocks, date exceptions, calendar events, lesson plans, session occurrences, tasks, migration runs,
quarantine records, command history, and app settings.

The critical distinction is:

- `ScheduleBlock`: recurring time structure
- `LessonPlan`: undated instructional content
- `SessionOccurrence`: a lesson scheduled on a specific local date and time

A Friday block is not a special rendering branch. It is a normal schedule block with `weekdays: [5]`.
All local dates use `YYYY-MM-DD`; clock values are integer minutes after midnight.
