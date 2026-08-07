# Phase 4D-1 — Learner Progress Read Model & Workspace Foundation

## Goal

Expose canonical Assessment Evidence through a teacher-facing, read-only Learner Progress workspace
without turning Evidence into grades, mastery, rankings, or hidden learner scores.

## Retained contracts

- app: `20.0.0-pilot.1`
- database: v17
- Portable Backup: v17
- Teaching Insights: contract v2
- Teaching Review: contract v1
- new Learner Progress derived contract: v1

No table, index, backup-format, or mutation-domain migration is introduced.

## Route

`#/learner-progress`

URL-backed state includes:

- `schoolYear`
- `period` plus `from` / `to` for Custom
- `view=contexts|standards` (`learners` is the compact default)
- `student`, `context`, or `standard` for the active view
- `status=archived|all` (`active` is the compact default)
- `kind=score|proficiency|observation` (`all` is the compact default)
- `evidence=<id>` for exact Evidence detail

## Read architecture

`LearnerProgressReadService -> LearnerProgressSnapshot -> buildLearnerProgressView -> Learner Progress workspace`

The read service validates canonical rows from:

- School Years
- Student records
- Learner Contexts
- Standards
- Assessment Evidence
- Lesson Plans
- Session occurrences
- Library items

The read model scopes Evidence to the selected School Year, applies explicit review filters, and
resolves current source records or retained Evidence snapshots.

## Semantics

### Student ownership

Evidence belongs to the canonical Student through `studentId`. Learner Progress does not infer a
Student from current Class/Group membership.

### Context view

Context mode uses `AssessmentEvidenceRecord.contextId`. This is the historical source link stored on
the Evidence record. It does not reconstruct historical membership from today's roster.

### Standard view

Standard mode shows only recorded Standard-linked Evidence. A count of zero or an empty scope is not
a mastery/failure statement.

### Evidence kinds

- Score is shown exactly as recorded, including optional maximum/label.
- Proficiency shows the explicit teacher-recorded label/scale metadata.
- Observation remains teacher-authored text.

No cross-assessment averaging, score normalization, proficiency inference, sentiment analysis, or
automatic trend judgment is performed.

### Historical sources

If a linked Context, Plan, Session, Assessment, or Standard no longer exists, the retained
`sourceSnapshots` value remains visible as a historical snapshot. A snapshot is not rendered as a
current source link.

## Explicitly deferred

Phase 4D-1 does not add:

- Add/Edit/Archive/Restore Evidence UI;
- `return=progress` navigation through writable source workspaces;
- Teaching Review exact Evidence-issue drill-down;
- current-retained-roster coverage calculations;
- expected-Evidence requirements or true gap detection;
- mastery, grades, learner ranking, readiness, ability, growth scores, or AI recommendations.

Those boundaries remain requirements for 4D-2 and 4D-3.
