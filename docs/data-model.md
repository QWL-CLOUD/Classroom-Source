# Data Model Foundation

The Phase 0 database includes stable tables for school years, learner contexts, recurring schedule
blocks, date exceptions, calendar events, lesson plans, session occurrences, tasks, migration runs,
quarantine records, command history, and app settings.

The critical distinction is:

- `ScheduleBlock`: recurring time structure
- `LessonPlan`: undated instructional content
- `SessionOccurrence`: a lesson scheduled on a specific local date and time

## Lesson content and inheritance

`LessonPlan` owns reusable instructional content:

- learning target
- plan notes
- ordered lesson-flow steps
- each step's phase, duration, directions, and teacher notes

A `SessionOccurrence` normally stores no duplicate teaching content. It resolves content from its
linked `LessonPlan`, so plan edits continue to appear in the Session. When a teacher customizes one
occurrence, the Session stores a `contentOverride` snapshot. That override remains independent until
**Use plan content** removes it and restores live inheritance.

Lesson Flow is stored inside the existing records. It does not add an IndexedDB table or require a
Dexie schema-version change because no new index is needed.

A Friday block is not a special rendering branch. It is a normal schedule block with `weekdays: [5]`.
All local dates use `YYYY-MM-DD`; clock values are integer minutes after midnight.
