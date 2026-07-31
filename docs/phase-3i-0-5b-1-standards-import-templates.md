# Phase 3I-0.5B.1 — Standards Import Templates

## Purpose

Close the usability gap between Roster and Standards import by providing formal,
downloadable CSV and XLSX templates from the canonical Import Center.

## Included

- `Classroom-Standards-Import-Template.csv`
  - reviewed import headers only;
  - no sample row that could be committed accidentally.
- `Classroom-Standards-Import-Template.xlsx`
  - `Standards Import` worksheet first;
  - `Instructions` worksheet;
  - `Examples` worksheet containing fictional examples only.
- Download controls in `#/import?type=standards`.
- Unit and Playwright coverage for generated structure and download filenames.

## Template fields

- Issuing Organization
- Framework Title
- Jurisdiction
- Subject
- Grade Band or Level
- Version
- Standard Code
- Standard Statement
- Parent Code
- Status
- Sort Order
- Source Name
- Import Note

`Standard Code` and `Standard Statement` are required. Source attribution entered
in Import Center remains the reviewed default; row-level source columns override
that default for the corresponding row.

## Locked safety decisions

- No database or schema change.
- No change to preview, duplicate, hierarchy, transaction, Import Run, Undo, or
  Redo behavior.
- No official Common Core, CLA Level Learning, STAMP, or other copyrighted
  standards text is bundled.
- Examples use `DEMO.*` identifiers and explicitly state that they are fictional.
- PDF, DOCX, OCR, and document-assisted extraction remain separate future work.
