# Phase 4B-2 — Precise Drill-down & Return Navigation

Status: implementation candidate on the shared Phase 4B development branch.

## Goal

Make Teaching Review a reliable read-only navigation layer: a teacher can open the exact source
record, perform an explicit action in the owning workspace when appropriate, and return to the
originating Review queue without relying on browser history.

## Navigation contract

Review-origin source URLs use explicit query state:

- `return=review`
- `schoolYear=<id>`
- `reviewQueue=<queue>`
- `reviewFocus=<entity-type>:<entity-id>`

Returning to Teaching Review converts this state back to:

- `schoolYear=<id>`
- `queue=<queue>`
- `focus=<entity-type>:<entity-id>`

Teaching Review restores keyboard focus to the originating row when it still exists. If a mutation
resolved or removed that row, focus falls back to the originating queue heading.

## Exact deep links

Phase 4B-2 establishes:

- `#/standards?standard=<id>`
- `#/library?item=<id>`
- `#/tasks?task=<id>`
- `#/tasks?reflection=<teaching-reflection-id>` for Reflection-linked Next Steps

Existing Session, Lesson Plan, learner-context, student, and Teaching Reflection links remain the
canonical source routes and gain explicit Review return state when opened from Teaching Review.

## Mutation boundary

Teaching Review itself remains read-only. Session, Planning, Teaching Reflection, Library,
Standards, Tasks, and Learners remain the owning workspaces for any allowed writes. The new return
contract changes navigation only; it does not create hidden review state or automatic mutations.

Session and Planning mutations that already navigate on completion now recognize `return=review` and
return to the originating Review queue. Teaching Reflection preserves the same return state while
moving between Reflection and Session.

## Assessment Evidence boundary

Assessment Evidence does not receive a temporary deep-link workspace in 4B-2. The domain has no
dedicated review route yet, and adding one only for navigation would pull learner-progress semantics
forward prematurely. Exact Evidence drill-down remains part of Phase 4D.

## Persistence and versions

No persistence changes:

- app version: `20.0.0-pilot.1` retained
- DB schema: v17 retained
- Portable Backup schema: v17 retained
- Teaching Insights contract: v2 retained
- Teaching Review contract: v1 retained

## Acceptance

- Review source actions open exact available records rather than broad workspaces.
- Archived Library items can still be opened by exact item deep link.
- Reflection Next Steps open only Tasks linked to that Reflection.
- Review-origin workspaces expose an explicit Back to Teaching Review control.
- Session/Planning/Reflection return navigation survives explicit mutations.
- Returning to Review restores queue and source focus, or the queue heading if the source no longer
  exists.
- Unknown/missing deep-link records fail safely without silently selecting a different requested
  record.
- No Assessment Evidence inference or new learner-progress surface is introduced.
- Full checks, targeted Chromium E2E, responsive review, accessibility, and manual QA pass.
