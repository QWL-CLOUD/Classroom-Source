# Phase 3D-5B-4 — Tasks, Learners & Agenda UX Closure

## Scope

This phase closes the highest-priority usability and visual-density issues in Tasks,
Learners, and Personal Agenda without changing the v20 data model or mutation rules.

## Tasks

- The full create form is closed by default.
- `New task` opens one focused editor and Cancel closes it.
- Complete/Reopen remains visible as the primary lifecycle action.
- Edit, Waiting/Restore, Cancel, and Delete move into one `More task actions` menu.
- Existing Reminder records remain source-linked and independently actionable.

## Learners

- Desktop retains the two-pane learner roster and detail workspace.
- At 900px and below, the permanent roster is hidden.
- A compact selected-context header and `Change learner` picker replace the roster.
- Planning is presented first, followed by Support & Notices and Context settings.
- Mobile layouts must not introduce horizontal page overflow.

## Personal Agenda

- The five summary values share one segmented summary surface.
- Empty sections use a lighter compact treatment.
- Reminder items visibly say `Reminder for` before the source-record title.
- Reminder notes receive a distinct relationship treatment while actions still update
  the original Reminder.

## Safety boundaries

- No IndexedDB version or schema change.
- No duplicate Task, Reminder, Notice, or Agenda records.
- No mutation-service changes.
- No lifecycle, deletion, or Undo/Redo rule changes.
- Existing source-record links and navigation remain authoritative.
