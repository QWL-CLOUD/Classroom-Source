# Phase 3E-4 — Lesson Template Foundation

## Goal

Create reusable Lesson Template source records that can be applied to Planning without turning
templates into Library Catalog items or allowing Plan edits to mutate template sources.

## Implemented model

- `lessonTemplates` is a separate Dexie v7 store.
- Each template has a stable ID, active/archived lifecycle, reusable Plan metadata, ordered Lesson
  Flow, and stable Activity/Resource/Assessment Library links.
- Template Format, Focus, Purpose, and Theme use managed Category assignments.
- No destructive delete is exposed.

## Application semantics

Applying a template to a Planning draft:

- copies the template's current reusable content;
- generates fresh IDs for every copied Lesson Flow step;
- preserves Plan context, workflow state, series, and schedule choice;
- records source template ID, title, source update time, and application time;
- never mutates the source template;
- does not cause later source-template edits to rewrite existing Plans;
- remains part of the normal transactional Plan save and global Undo/Redo history.

Library links remain stable-ID references. Existing explicit frozen Library snapshots are copied
when present; no hidden duplicate Library records are created.

## UX

- New Resources navigation destination: Lesson Templates.
- Search and filter by lifecycle and Template Format.
- Create, edit, archive, restore, Undo, and Redo.
- Reuse the existing Lesson Flow and Library-link editors.
- Apply active templates from the Planning editor with a clear replacement notice and source
  provenance.

## Non-goals

- Standards import, alignment, or coverage
- template sharing or marketplace
- file uploads or Google Drive
- AI-generated templates
- destructive deletion
- bulk migration of v19 templates

## Acceptance

- Zod validation and Dexie v7 persistence
- transactional Category assignments
- separate Template command serialization
- global Undo/Redo
- fresh copied step identity
- Plan and template independence
- keyboard/mobile/axe regression coverage
