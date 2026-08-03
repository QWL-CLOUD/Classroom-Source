# Phase 3I-0.5G.1 — Library Classification Families & Assignment Closure

## Goal

Establish canonical reusable classifications for Library Activities, Resources, and Assessments
before import-time classification resolution is expanded.

This phase prevents new Library content from depending only on free-text tags. It does not migrate
or remove existing tags.

## New code-owned families

| Family          | ID               | Selection |
| --------------- | ---------------- | --------- |
| Subjects        | `subject`        | Multiple  |
| Grade Levels    | `grade-level`    | Multiple  |
| Languages       | `language`       | Multiple  |
| Language Levels | `language-level` | Multiple  |
| Activity Types  | `activity-type`  | Single    |

Existing families continue to be reused:

- Purpose Tags
- Focus Tags
- Resource Formats
- Template Formats

Assessment Kind remains a controlled system enum.

## Library assignment matrix

### Activities

- Subjects
- Grade Levels
- Languages
- Language Levels
- Activity Types
- Purpose Tags
- Focus Tags

### Resources

- Subjects
- Grade Levels
- Languages
- Language Levels
- Resource Formats
- Purpose Tags
- Focus Tags

### Assessments

- Subjects
- Grade Levels
- Languages
- Language Levels
- Purpose Tags
- Focus Tags

Legacy Library Standards do not receive these classifications.

## Safety and compatibility

- Stable `CategoryValue` IDs remain the source of truth.
- Names and aliases remain scoped to one family.
- Rename, archive, restore, merge, Replace and Archive, usage counts, and global Undo/Redo reuse
  the existing Categories & Labels foundation.
- Archived values remain visible on existing Library items but cannot be newly assigned.
- The shared category mutation service now validates `library-item` targets directly.
- Library create and update transactions continue to save the item and all category assignments as
  one undoable action.
- Existing free-text tags are preserved.
- No existing tag is silently converted or deleted.
- No Import Center behavior changes in this phase.
- No database migration is required.

## Database and backup

The existing DB v13 tables already support all new families:

- `categoryValues`
- `categoryAssignments`
- `libraryItems`
- `changeLog`

The database and backup schema versions remain 13. Backup and restore validation accepts and
round-trips the new family IDs.

## User interface

- Categories & Labels exposes the new managed families.
- The page eyebrow is aligned with the `CONTENT` navigation group.
- Activity, Resource, and Assessment editors expose only the families approved for that catalog
  type.
- Library details display all applicable classification families.
- Archived assigned values are marked as archived.

## Deferred

Phase 3I-0.5G.2 will add Library facet filters and counts.

Phase 3I-0.5H will expand import-time unique-value resolution for Subject, Grade Level, Language,
Language Level, Activity Type, Purpose, Focus, and Resource Format. Preview remains no-write and
new values or aliases require explicit reviewed commit.
