# Phase 3I-0.5I.1 — Classification Mapping Preset Foundation & Management

## Purpose

Add reusable import-classification mappings as first-class classification infrastructure without yet changing import preview resolution.

A mapping translates one normalized external text value within one classification family to one stable canonical `CategoryValue` ID.

```text
family: subject
external text: ELA
target: English Language Arts
```

## Persistence

- Database schema advances from v13 to v14.
- New entity: `ClassificationMappingPreset`.
- New table: `classificationMappingPresets`.
- Unique key: `[familyId+normalizedSourceText]`.
- Lifecycle: `active`, `inactive`, or explicit deletion.
- Targets are stored by stable `CategoryValue` ID.

## Vocabulary boundary

A mapping is not a `CategoryValue` alias.

- Canonical names and aliases remain controlled-vocabulary identity.
- Mapping presets remain import-only translations.
- Deleting a mapping never deletes a controlled value or imported record.

## Management

Mappings are managed in **Categories & Labels** under:

```text
Controlled values | Import mappings
```

Supported actions:

```text
Create
Edit source text
Retarget
Activate
Deactivate
Delete
```

Health states expose inactive, shadowed, archived, merged, missing, and wrong-family targets.

## Category lifecycle

- Archive is blocked while an active mapping targets the value.
- Delete is blocked while any active or inactive mapping targets the value.
- Replace and Archive retargets mappings in the same transaction.
- Merge retargets mappings in the same transaction.
- Undo and Redo replay mapping changes with the category action.

## Backup and rollover

- Backup database schema is v14.
- Backup envelope remains `classroom-v20-backup-v1`.
- Schema v13 remains a supported legacy presetless backup.
- Restoring schema v13 creates an empty mapping table and shows a warning.
- Rollover safety snapshots include mappings.
- Rollover leaves active mappings unchanged because they are global infrastructure.

## Non-goals

This foundation phase does not:

- apply mappings automatically during import preview;
- add Apply once, Save as mapping, or Update mapping to Import Center;
- change `ImportRun` audit records;
- integrate Standards or Roster import;
- support fuzzy, wildcard, vendor-specific, or file-specific mappings;
- import or export mapping presets through CSV or XLSX.

Those importer behaviors belong to Phase 3I-0.5I.2.
