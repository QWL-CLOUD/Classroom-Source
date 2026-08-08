# Phase 4E — Session Closeout & Reflection Handoff

Phase 4E closes the high-frequency daily teaching loop by coordinating existing Session, Assessment
Evidence, Teaching Reflection, and Task capabilities. It does not add a new persisted closeout
domain.

## Completion handoff

When a Session is completed from a daily planning origin (`Learners`, `Today`, `Week`, or
`Calendar`), Classroom stays in the now-completed Session. The existing `Session Evidence` and
optional `Teaching Reflection` actions become immediately available, and the teacher explicitly
returns to the originating daily surface when finished.

Teaching Review and Learner Progress are specialized source-workflow origins. Their existing precise
automatic return behavior remains unchanged. Reopening a completed Session also retains the existing
return behavior.

## Session Evidence return contract

Learner Progress accepts a validated navigation-only closeout parent consisting of:

- source type: Session or Teaching Reflection;
- an internal `#/planning/session...` or `#/planning/session/reflection...` href containing a Session
  id.

The contract is URL-only. It is preserved through Learner Progress source drill-down so a teacher can
review or edit source-linked Evidence and still return to the original Session/Reflection closeout.
Malformed or external closeout hrefs are ignored.

## Teaching Reflection exit

Teaching Reflection keeps `Back to Session` and adds a direct return to daily origins. Review and
Progress origins continue to use the existing global precise-return bars. Reflection remains
teacher-authored judgment linked one-to-one with a completed Session; it is not required for Session
completion.

## Retained ownership boundaries

- Session owns delivery/completion state.
- Assessment Evidence owns learner Evidence.
- Teaching Reflection owns teacher-authored judgment.
- Tasks own Next Steps.
- Phase 4E owns navigation orchestration only.

Phase 4E does not add automatic mastery, grades, learner ranking, readiness inference, universal
progress scores, expected-Evidence semantics, automatic Evidence, automatic Reflection, closeout
completion scores, or AI interpretation of teacher narrative.

## Platform contracts

- app `20.0.0-pilot.1`
- DB schema v17
- Portable Backup schema v17
- Teaching Insights contract v2
- Teaching Review contract v1
- Learner Progress contract v1
