# Phase 3I-0.5E — Assessments Import

This phase enables reviewed Assessment definition imports in the canonical Import Center.

## Included

- CSV, XLSX, JSON, and pasted-table sources
- formal CSV/XLSX templates
- five controlled Assessment Kind values
- stable external identity
- Create, Update, Skip, Review, and Blocked classifications
- no-write preview
- atomic commit and one global Undo/Redo action
- immediate Library Assessments visibility
- import history and backup coverage

## Explicit boundaries

This phase does not import Student Evidence, scores, Rubrics, criteria, performance levels,
proficiency scales, Standard alignments, attachments, PDF/DOCX content, or AI-generated content.

Assessment Kind is a fixed enum, not a managed Category family. Quiz, exit ticket, checklist,
observation, project, and similar method labels require explicit review rather than silent
classification.

Rubric criterion worksheets are blocked because one row is not one reusable Assessment definition.
