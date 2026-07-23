# Phase 3E-2 — Library Catalog Foundation

## Baseline

- `main`: `d02ec0f3e634b1ba9bb7bbc5e6a971bd6fd99407`
- branch: `phase-3e-2-library-catalog-foundation`

## Delivered

- One persistent Library Catalog for Activities, Resources, Assessments, and Standards.
- Stable item IDs with common title, description, tags, status, and timestamps.
- Active and Archived lifecycle without destructive deletion.
- Search across titles, descriptions, tags, types, and Resource Formats.
- Type, status, tag, and Resource Format filters with a clear-filters action.
- Shared master-detail Library workspace.
- Resource items reuse the existing managed `Resource Formats` category family.
- Create, edit, archive, and restore are transactional and globally undoable/redoable.
- Dexie schema v6 adds the `libraryItems` table.
- Existing category assignments use the pre-established `library-item` entity type.
- Standards receive stable catalog records now; import, alignment, and coverage remain deferred.

## Explicitly deferred

- Standards import
- Planning-to-Standards alignment
- Standards coverage reporting
- Templates CRUD
- Activity procedure builder
- Assessment rubric builder
- Resource file upload and attachment storage
- destructive Library deletion
