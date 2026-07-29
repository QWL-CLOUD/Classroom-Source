# Phase 3I-0.5A — Import Core & Database v13

## Purpose

Phase 3I-0.5A establishes one shared, local-first import foundation before the existing Import Center
is expanded beyond Standards. It does not add a new route, expose new import modes in the UI, or
change the current Standards and roster workflows.

## Shared source pipeline

The shared `importCenter` feature owns safe source adapters for:

- CSV and tab/semicolon-delimited text;
- XLSX worksheets with the existing ZIP/XML expansion limits;
- JSON arrays, object rows, and explicit worksheets;
- pasted tables.

All supported tabular sources normalize to `ImportWorkbook`, then `ImportTable`. The table model keeps
source row numbers, creates stable unique display headers, suggests domain mappings through explicit
alias dictionaries, and never writes records.

`ImportPreview` uses the common classifications `create`, `update`, `skip`, `review`, and `blocked`.
A preview is committable only when it contains at least one create/update and no unresolved review or
blocked row. A stable source fingerprint allows later commit services to reject stale previews.

## Canonical import history

Dexie v13 adds `importRuns`. An `ImportRun` records the import type, source kind, optional source and
worksheet labels, optional roster target context, row classification counts, and commit timestamp.
The counts must equal the total source rows. Legacy `standardImportBatches` remain readable and are
combined with canonical runs by the history read service without rewriting old data.

Library Catalog items gain optional import provenance:

- external source;
- external key;
- readable source reference;
- normalized import identity key;
- last canonical import run ID.

`importIdentityKey` is uniquely indexed. It requires both external source and external key, preventing
a title-only import from silently becoming an update identity.

## Transaction and Undo/Redo contract

`import-center.*` commands can atomically put or delete:

- canonical import runs;
- Library Catalog records;
- category assignments;
- Standard alignments.

The command domain participates in persistent global Undo/Redo. Later catalog import phases will use
one compound command so Undo restores created records, updated records, relationships, and import
metadata together.

## Backup and restore

Backup schema v13 includes `importRuns`. Schema v10, v11, and v12 backups remain supported:

- v10 restores Student, roster, Assessment Evidence, and import history tables empty;
- v11 restores Assessment Evidence and import history empty;
- v12 restores canonical import history empty.

Restore remains previewed, quarantined, atomic, and rollback-safe. Existing recovery-internal tables
remain excluded from exported user backups.

## Explicitly deferred

- Import Center type selection and route query state;
- migration of Standards and roster UI into the canonical Import Center;
- Activities, Resources, and Assessments domain adapters and commit services;
- local attachment or ZIP-package persistence;
- navigation rename and contextual deep links.
