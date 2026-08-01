# Phase 3I-0.5E.1 — Roster Pasted Table Parity

## Scope

Roster Import now accepts either a reviewed CSV/XLSX file or a locally pasted delimited table.

Pasted tables use the existing roster columns:

- Name — required
- Preferred Name — optional
- Role — optional
- Notes — optional

The canonical shared parser accepts tab-, comma-, or semicolon-delimited rows and applies the
existing 20 MB source safety limit.

## Review and commit behavior

- Parsing and preview do not write to IndexedDB.
- Editing pasted text invalidates the prior parsed workbook and preview.
- Switching between File and Pasted table clears the prior reviewed source and confirmation.
- Changing the target Class or Group clears pasted text and all prior review state.
- Existing Student matching, duplicate classification, row decisions, and roster rules are
  unchanged.
- Commit remains one atomic import action with persistent global Undo/Redo.
- Import history records `sourceKind: paste-table`, `sourceLabel: Pasted table`, and
  `worksheetName: Pasted table`.

## Non-goals

This phase does not add JSON roster import, Standards pasted-table support, database migrations,
new Student identity rules, roster hierarchy, templates, CONTENT navigation changes, or Library
deep links.
