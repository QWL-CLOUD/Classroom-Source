# Phase 4A-2 — Teaching Reflection and Next Steps

## Scope

Phase 4A-2 adds a persistent Teaching Reflection domain linked one-to-one with a completed Session and reuses the existing Task domain for actionable Next Steps.

The implementation remains teacher-authored and source-linked. Classroom stores reflection narrative and Task lifecycle facts but does not analyze narrative, score teaching quality, infer learner mastery, rank learners, or generate AI recommendations.

## Data contract

### Teaching Reflection

`TeachingReflectionRecord` owns:

- its Session, School Year, planning context, Lesson Plan, and occurrence date identifiers;
- retained context, Lesson Plan, and Session snapshots;
- optional `whatWorked`, `whatToAdjust`, and `additionalNotes` narrative fields, with at least one required;
- active or archived lifecycle state;
- created, updated, and optional archived timestamps.

A unique `sessionOccurrenceId` index ensures that a Session has at most one Teaching Reflection. Creating a Reflection atomically writes the Reflection, the Session `reflectionId`, and the global edit-history command. Undo and redo restore both sides of that link.

A Reflection can only be created for a completed Session. Reopening, cancelling, unscheduling, or deleting source records does not cascade-delete the retained Reflection. Current source availability and retained snapshots are presented separately.

### Assessment Evidence boundary

Learner-specific scores, proficiency records, and observations remain Assessment Evidence. The Reflection editor reads Evidence linked to the same Session but does not copy or transform it into Reflection narrative.

### Next Steps

Actionable Next Steps are existing Tasks with:

```text
linkedEntityType = teaching-reflection
linkedEntityId = <reflection id>
contextId = <reflection context id>
```

They keep the existing Task lifecycle, reminders, categories, Agenda placement, undo/redo behavior, and Tasks workspace. A Reflection can link to multiple Tasks. Archiving a Reflection does not cancel or delete its existing Tasks, but a new Task cannot be created until the Reflection is restored.

## Persistence and portability

- Classroom DB schema: **v17**
- Portable Backup schema: **v17**
- Portable table count: **33**
- New table: `teachingReflections`
- Legacy v16 and earlier backups restore with an empty Reflection table and an explicit warning.
- School Years containing retained Reflections cannot be deleted and can be archived instead.

## Routes and navigation

Teaching Reflection uses a Session-linked hidden route:

```text
#/planning/session/reflection?session=<session id>
```

It is not a new primary-navigation destination. Entry points are provided from completed Session editors and Teaching Insights source traces.

## Editor behavior

The Reflection editor provides:

- retained source summary and current source state;
- teacher narrative fields;
- archive and restore actions;
- related Assessment Evidence;
- creation and lifecycle management of linked Next Step Tasks;
- source links back to the Session, learner records, Tasks, and Teaching Insights.

The 390px layout avoids page-level horizontal overflow. Form controls use explicit accessible names, statuses and errors are announced, and archived state is not conveyed by color alone.

## Teaching Insights v2

Teaching Insights data contract v2 adds:

- active and archived Reflection counts;
- completed Sessions with an active Reflection;
- completed Sessions without an active Reflection;
- Reflection coverage with explicit numerator and denominator;
- active, waiting, completed, cancelled, open, and closed Reflection-linked Task counts;
- source-linked Reflection rows and current Session state.

Only Reflection records and linked Task states are counted. Reflection narrative is not read for analytics.

## Validation

Closure coverage includes:

- domain and DB v17 migration tests;
- Backup v17 export, restore, legacy restore, and quarantine tests;
- School Year deletion protection;
- atomic Reflection mutation and global undo/redo;
- source availability, Evidence, and Task read models;
- Reflection editor and related-record component tests;
- Teaching Insights v2 derived-model and dashboard tests;
- Chromium E2E for Reflection creation, source linkage, Next Step Task lifecycle, Insights metrics, URL state, responsive behavior, and axe accessibility;
- Chromium and WebKit Personal Pilot smoke checks for DB v17, Backup v17, Teaching Insights, and the Reflection route.

## Non-goals

Phase 4A-2 does not add:

- AI-generated reflection or summaries;
- teaching-quality, effectiveness, or sentiment scoring;
- learner mastery, grades, or ranking;
- automatic Evidence or Task creation;
- mandatory Reflection enforcement;
- Reflection templates, attachments, voice transcription, or multi-user authorship;
- historical roster reconstruction or immutable completed-Session content snapshots.
