# Phase 3C-4 — Planning Entry and Deletion Closure

## Scope

Phase 3C-4 closes the creation and deletion gaps around Planning Items and their single Session occurrence.

## Dated planning entry

- Today exposes **New plan** for the selected date.
- Every Week day column exposes an accessible `+` planning entry.
- Every Calendar day exposes an accessible `+` planning entry.
- When a dated workspace opens Planning without a context, the user first chooses an active Class, Group, or Individual from the active school year.
- **Save plan** keeps the item unscheduled and returns to Learners.
- **Save and schedule** opens Session with the originating date prefilled.
- Saving the Session returns to Today, Week, or Calendar when that surface initiated the flow.
- Existing Session management links also preserve their source surface and date.

## Deletion

- Learners cards expose **Delete plan** for unscheduled, scheduled, and completed items.
- Edit Plan also exposes the same deletion behavior.
- Deletion requires a second explicit confirmation.
- If linked Sessions exist, the confirmation states that they will also disappear from Today, Week, Calendar, and Learners.
- Plan deletion, linked Session deletion, and Lesson Series sequence normalization commit in one Dexie transaction and one compound change-log command.
- Global Undo/Redo restores or reapplies the whole deletion.

## Data constraints

- No Dexie table, index, or database version change.
- Planning Items and Sessions remain single shared records across Learners, Today, Week, and Calendar.
- Source-only implementation; no generated `dist` files are part of the change.
