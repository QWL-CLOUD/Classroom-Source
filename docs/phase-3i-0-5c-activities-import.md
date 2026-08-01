# Phase 3I-0.5C — Activities Import

## Scope

Phase 3I-0.5C activates Activities in the single canonical Import Center at `#/import`.
It does not create a second route, mapping system, preview system, history store, or Undo/Redo path.
Imported rows become real `libraryItems` records with `catalogType: "activity"` and are immediately
available in Library → Activities.

Supported reviewed sources:

- CSV;
- XLSX with explicit worksheet selection;
- JSON workbook/table data;
- pasted tabular text.

Resource import, Assessment import and templates, attachments, PDF/DOCX extraction, OCR, AI
generation, background import, Library import deep links, and the RESOURCES → CONTENT rename remain
outside this phase.

## Formal Activity templates

The canonical Activities workspace provides:

- `Classroom-Activities-Import-Template.csv` — a UTF-8 BOM, header-only CSV for Excel compatibility;
- `Classroom-Activities-Import-Template.xlsx` with `Activities Import`, `Instructions`, and
  `Examples` worksheets.

The formal headers cover every reviewed Activity import field and automatically map to the existing
Activity import model. The Instructions worksheet explains stable identity, controlled Purpose/Focus
review, grouping and status values, text-only fields, and the difference between external source and
source reference. Examples are entirely fictional and must be deleted or replaced before real use.

The same completed table may be uploaded as CSV/XLSX or copied into the existing Pasted table source
option. The template adds guidance and download controls only; it does not change preview, commit,
history, Undo/Redo, DB v13, or source-adapter behavior.

## Activity persistence

Activities continue to use the DB v13 `libraryItems` table. No Dexie store, index, schema version,
or migration is added.

Activity workflow fields are:

```ts
{
  catalogType: 'activity';
  grouping: 'whole-class' | 'small-group' | 'partners' | 'individual' | 'flexible';
  estimatedMinutes?: number;
  directions?: string;
  materials?: string;
  notes?: string;
}
```

`materials` and `notes` are text only. Binary data, local paths, base64 payloads, and attachments are
not accepted.

Existing DB v13 provenance fields are used:

- `externalSource` — stable publisher/catalog namespace;
- `externalKey` — stable key within that namespace;
- `sourceReference` — URL, document, page, or citation;
- `importIdentityKey` — normalized Activity identity;
- `lastImportRunId` — canonical Import Center run.

The strong identity is:

```text
activity + normalized external source + normalized external key
```

An `activity_id` without a reviewed external source is not a global identity. Title equality alone
never authorizes an update.

## Reviewed normalized fields

The Activity model maps and preserves:

```text
activity_id, title, purpose, subject, skill, grade_level, language_level,
duration_minutes, grouping, preparation, materials, steps, teacher_language,
differentiation, variations, assessment_opportunity, tags, source, status
```

It also accepts reviewed aliases for description, Activity type, external source, source reference,
and notes.

- `steps`/`instructions` → `typedFields.directions`;
- `materials` → `typedFields.materials`;
- preparation, teacher language, differentiation, variations, assessment opportunity, Activity type,
  imported notes, and preserved unmapped columns → labeled sections in `typedFields.notes`;
- subject, grade, and language level → searchable, prefixed generic tags;
- purpose and skill → controlled Purpose/Focus category assignments;
- legacy `source` → source reference unless the user maps it explicitly as external source.

Non-empty unmapped columns require an explicit decision: preserve them in notes or confirm ignore.
No source column is silently discarded. Blank update cells preserve existing values; this phase has
no destructive clear token.

## Classification

Every row displays one classification and visible reasons:

- **Create** — no strong existing identity was selected;
- **Update** — exact strong identity or an explicit reviewed duplicate decision;
- **Skip** — unchanged stable identity, reviewed skip, or exact repeated source row;
- **Review** — missing source namespace, archived identity, probable title duplicate, or unresolved
  controlled value;
- **Blocked** — invalid required data, unsafe limits, conflicting source identities, or identity
  collision.

An archived identity match is never silently restored. The user chooses skip, update while archived,
or restore and update.

## Purpose and Focus categories

Purpose and Focus families now support Library Activities. Category selection is scoped by catalog
subtype:

- Activity: Purpose Tags and Focus Tags;
- Resource: Resource Formats.

This prevents Activities from exposing Resource Formats and prevents Resources from exposing
Activity Purpose/Focus controls.

Controlled values resolve in this order:

1. active normalized name;
2. active alias;
3. reviewed merged replacement;
4. reviewed archived restore;
5. reviewed existing replacement;
6. explicitly created controlled value;
7. explicitly retained generic tag;
8. explicitly ignored value.

Unknown values are never created silently. New or restored values are committed in the same
transaction as Activities, assignments, import metadata, and history.

## Preview, commit, rollback, and history

Preview reads source and current IndexedDB state but writes nothing.

Commit requires:

- no Review or Blocked rows;
- explicit whole-preview confirmation;
- a separate update confirmation when updates exist;
- current Activity, category, and assignment snapshots still matching preview;
- no new identity or category collision.

One Dexie transaction covers:

```text
categoryValues
libraryItems
categoryAssignments
importRuns
changeLog
```

Any failure rolls back the complete transaction. One `import-center.activities.reviewed` change log
entry stores the reviewed forward and inverse commands. One global Undo reverses records, status,
tags, workflow fields, provenance, controlled values, assignments, and import metadata. Redo
reapplies the same reviewed command without reparsing or reclassifying the source.

Safety limits:

- maximum 5,000 Activity rows per commit;
- maximum 20 MB combined serialized forward/inverse command;
- no silent text or tag truncation.

## Backup and restore

The existing DB v13 backup format already includes `libraryItems`, `categoryValues`,
`categoryAssignments`, `importRuns`, and history-compatible records. Optional Activity materials and
notes remain inside the existing typed-fields object. No backup version change is required.

## Validation targets

Targeted validation covers:

- aliases and all legacy fields;
- stable identity and title-only review;
- archived matches;
- unmapped-column preservation;
- Purpose/Focus resolution and explicit creation/restore;
- preview purity;
- atomic mixed create/update/skip commit;
- stale-preview rejection and forced rollback;
- global Undo/Redo;
- backup round-trip;
- immediate Library visibility and reload persistence;
- CSV, XLSX, JSON, and pasted-table flows;
- compact viewport containment, keyboard access, and axe.
