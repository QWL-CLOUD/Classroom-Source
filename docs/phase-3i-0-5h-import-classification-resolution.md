# Phase 3I-0.5H — Import Classification Resolution

## Purpose

Activities, Resources, and Assessments now resolve imported classification text into the canonical
Library category families introduced in Phase 3I-0.5G. Imported classifications use stable
CategoryValue IDs and CategoryAssignments rather than new prefixed tags or notes.

## Field matrix

| Import type | Canonical families                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Activities  | Subjects, Grade Levels, Languages, Language Levels, Activity Types, Purpose Tags, Focus Tags   |
| Resources   | Subjects, Grade Levels, Languages, Language Levels, Resource Formats, Purpose Tags, Focus Tags |
| Assessments | Subjects, Grade Levels, Languages, Language Levels, Purpose Tags, Focus Tags                   |

Assessment Kind and Activity Grouping remain controlled enums. Related Unit remains a generic tag.
Teacher Language remains instructional text. Existing legacy prefixed tags and notes are preserved;
there is no silent backfill or cleanup.

## Resolution rules

- Active exact names and active exact aliases resolve automatically within their family.
- Unknown, archived, merged, and ambiguous matches require an explicit preview decision.
- Unknown values may be created, mapped to an active value, kept as a generic tag, or ignored.
- Archived values may be restored and used, mapped elsewhere, kept as a generic tag, or ignored.
- Merged values may use their active replacement, map elsewhere, remain a generic tag, or be ignored.
- Merged history is never restored.
- Family matching is isolated; the same text in another family is not a match.
- Multiple-assignment families accept semicolons, vertical bars, or line breaks.
- Activity Type and Resource Format accept one source value per item and block multiple values.

## Update behavior

- A blank or absent classification field preserves the existing family assignments.
- A nonblank field with canonical resolutions replaces that family assignment set.
- A nonblank field resolved only as generic tags or ignored values preserves existing canonical
  assignments.
- Unrelated families are untouched.

## Preview and commit

Preview is no-write. It plans:

- new CategoryValues;
- restored CategoryValues;
- assignment deletions and creations;
- compact Import History audit records;
- expected CategoryValue and CategoryAssignment snapshots for stale-preview rejection.

Commit writes CategoryValues, Library items, CategoryAssignments, ImportRun, and one ChangeLog entry
in a single transaction. One global Undo/Redo action reverses or reapplies the complete import.

ImportRun `summaryJson` records the source fingerprint, defaults, created/restored counts, and compact
classification audit records. The import blocks rather than truncates when the summary would exceed
100,000 characters.

## Source parity

CSV, XLSX, JSON, pasted tables, Resource URL rows, and Resource file-metadata rows converge on the
same preview models. Resource sources without classification fields remain unchanged.

Formal templates add:

- Activity: Language;
- Resource: Language, Purpose, Skill;
- Assessment: Language, Purpose, Skill.

Resource Type is accepted as an alias for Resource Format.

## Compatibility

- Database schema remains version 13.
- Backup format remains version 13.
- No migration, table, or index is added.
- Standards and Roster imports are unchanged.
- Library facets from Phase 3I-0.5G.2 immediately filter newly imported canonical assignments.
