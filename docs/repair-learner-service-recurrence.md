# Learner Service Recurrence Repair

## Baseline

- `main`: `bda00e2c40fafb84c6be34fc1fc6778f2ceaa868`
- branch: `repair-learner-service-recurrence`

## Closure

- Learner Service can remain open-ended or use a weekly recurrence.
- Weekly recurrence stores weekdays, inclusive start/end dates, and start/end time.
- Students to Notice shows a recurring service only on matching dates.
- Completed and cancelled occurrences are persisted separately and hide only that date.
- Future dates remain derived from the recurrence.
- Occurrence Complete, Cancel, and Restore are globally undoable/redoable.
- Learner Support & Notices shows the recurrence and occurrence history.
- Editing a recurrence changes future derivation without deleting past occurrence history.
- Existing Learner Services without recurrence keep their prior every-day behavior.
- Service occurrence history blocks permanent deletion of the parent record.
- Learner Service remains separate from teaching Schedule Blocks and does not enter Week or Calendar.

## Storage

Dexie schema v5 adds `learnerServiceOccurrences` with a unique
`[learnerNoticeId+date]` index. Only acted-on occurrences are stored.
