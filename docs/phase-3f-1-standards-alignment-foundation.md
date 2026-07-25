# Phase 3F-1 — Standards Catalog & Alignment Foundation

Phase 3F-1 introduces independent Standard source records and explicit alignment records.

## Persistent identity

Dexie schema v8 adds the stores below and updates System Health to recognize schema v8 as the
expected current database version:

- `standards`
- `standardAlignments`

A Standard code is unique only inside its framework identity. The stored framework key is derived
from the issuing organization, framework title, jurisdiction/scope, and version. The normalized code
and framework key form the unique compound identity.

Standards also support:

- subject;
- grade band or level;
- statement;
- optional parent Standard;
- stable sort order;
- active and archived lifecycle.

Parent and child Standards must belong to the same framework version, and hierarchy cycles are
rejected. Archived Standards cannot be selected as new parents. A parent framework identity cannot
be changed while child Standards still reference it; children must be reassigned first.

## Explicit alignments

Alignment records contain stable references to:

- a Standard;
- a Lesson Plan or Lesson Template target;
- optionally, one persisted Lesson Flow step.

Alignments are independent records rather than copied Standard text or arrays embedded in each
teaching record. Editing either side never rewrites the other.

The Planning editor supports:

- Plan-level alignment;
- persisted Lesson Flow step alignment.

Lesson Template details support:

- Template-level alignment;
- persisted Template Lesson Flow step alignment.

Creating a new Plan or Template must be completed before alignment because target and step IDs must
already be stable. Planning alignment scopes use the last saved Lesson Flow, so unsaved step changes
must be saved before they become alignment targets.

## Lifecycle and history

- Archived Standards are excluded from new alignment choices.
- Existing archived alignments remain visible and can be removed explicitly.
- Standard create, edit, archive, and restore are transactional and globally undoable/redoable.
- Replacing a target's alignment set is one transaction and one global history command.
- Deleting a Plan removes all of its alignment records in the same undoable command.
- Removing a persisted Plan or Template step removes orphaned step alignments transactionally;
  Undo restores both the step and its alignments.

## Legacy Library Standard placeholders

Phase 3E-2 allowed temporary `standard` Library Catalog records. Phase 3F-1 stops offering that type
for new Library items. Existing placeholders remain readable for backward compatibility but cannot
be attached as Activity, Resource, or Assessment applications. Teachers create and align Standards
through the independent Standards workspace.

## Deferred to Phase 3F-2

- CSV, XLSX, PDF, or API import;
- bulk framework ingestion;
- duplicate and hierarchy preview for imported frameworks;
- coverage summaries and gap analysis;
- framework crosswalks;
- AI-generated alignment;
- destructive Standard deletion.
