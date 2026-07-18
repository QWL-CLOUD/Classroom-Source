# Phase 3C-6B — Plan This Schedule Block

## Scope

- Add `Plan this block` to eligible Default Schedule occurrences in Today and Week.
- Carry the selected occurrence date, resolved start/end time, and Schedule Block ID into Planning.
- Suggest the block context when it is active, while allowing any active Class, Group, or Individual to be selected.
- Create one Planning Item and one Session occurrence in one validated transaction.
- Detect an existing Session by occurrence plus selected context and open its Plan rather than creating a duplicate.
- Allow another active context to use the same occurrence.
- Render attached Sessions as the teaching content of the Schedule occurrence rather than as duplicate timeline cards.
- Preserve source route, date, Week occurrence focus, and global Undo/Redo.

## Locked model

- Schedule Blocks define recurring time structure.
- Planning Items define teaching intent and content.
- Sessions are dated occurrences of Planning Items.
- The selected context becomes the Plan and Session context; a block default is only a suggestion.
- Today, Week, Calendar, and Learners read the same Session record.

## Non-goals

- Hard-binding a Plan to the block's default context.
- More than one primary Plan for the same occurrence and context.
- Cross-context batch creation.
- Changing Schedule Block recurrence.
- Lesson Templates, Library references, attachments, or resource links.

## Acceptance coverage

- Today and Week expose occurrence-first planning links.
- Modified occurrence times are carried into the Session.
- The suggested context can be changed before saving.
- One atomic Plan + Session creation is globally undoable and redoable.
- Same occurrence + same context opens the existing Plan.
- Same occurrence + different context creates a separate Plan and Session.
- Attached Sessions stay synchronized across Today, Week, Calendar, and Learners.
- The Week return route restores the selected date and occurrence focus.
- Browser accessibility checks cover the new workflow.
