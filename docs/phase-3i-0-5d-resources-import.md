# Phase 3I-0.5D — Resources Import

Phase 3I-0.5D enables reviewed Resource imports in the one canonical Import Center at
`#/import?type=resources`.

## Sources

- CSV;
- XLSX with explicit worksheet selection;
- JSON;
- pasted tables;
- one URL prepared locally without a network request;
- local-file metadata rows using only file name, MIME type, size, and last-modified date.

Classroom does not fetch webpages, download remote files, read selected file contents, retain full
local paths, or persist Blob/base64 data. File metadata rows explicitly record that the file itself is
not stored.

## Formal templates

The Resource workspace provides:

- `Classroom-Resources-Import-Template.csv` — UTF-8 BOM and reviewed headers only;
- `Classroom-Resources-Import-Template.xlsx` with `Resources Import`, `Instructions`, and
  `Examples` worksheets.

Examples are fictional and use the reserved `example.invalid` domain. Templates contain no private
school links, credentials, files, or copyrighted instructional content.

## Identity and duplicate rules

`External Source + Resource ID` is the only strong automatic update identity. Matching title, URL,
file name, or source location produces a visible probable-duplicate review and never overwrites
silently. Archived identity matches require an explicit keep-archived or restore decision.

## Resource Format

Resource Format remains the existing single-select controlled category family. Active exact names or
aliases resolve directly. Unknown, archived, and merged values require explicit preview decisions.
New or restored values are committed with the Resource records in the same transaction and are
covered by the same global Undo/Redo entry.

## Transaction and history

Preview writes nothing. One explicit commit applies Resources, status, tags, Resource Format
relationships, provenance, and `importRuns` metadata atomically. Any failure rolls back every table.
One persistent global Undo reverses the entire reviewed import; Redo replays the same reviewed command
without re-reading files or revisiting URLs.

## Persistence

Resources remain real `libraryItems` records with `catalogType: 'resource'`. The existing DB v13
fields are used:

- `typedFields.sourceLocation`;
- `typedFields.usageNotes`;
- `externalSource`;
- `externalKey`;
- `sourceReference`;
- `importIdentityKey`;
- `lastImportRunId`.

No DB version, table, index, migration, or backup-format change is required. Imported Resources appear
immediately in Library → Resources. Safe absolute `http` and `https` locations render as external
links with `noopener noreferrer`; non-URL locations remain text.

## Non-goals

Binary attachments, file-content hashing, ZIP packages, cloud-provider OAuth, remote metadata
fetching, URL health monitoring, PDF/DOCX extraction, OCR, AI generation, automatic overwrite,
Resource-to-Standard alignment, Library import deep links, and the RESOURCES → CONTENT navigation
rename remain outside this phase.
