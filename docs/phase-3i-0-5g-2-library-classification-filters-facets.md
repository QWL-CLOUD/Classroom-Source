# Phase 3I-0.5G.2 — Library Classification Filters & Facets

## Scope

This phase adds read-only canonical classification filters to Library without changing DB schema
version 13, backup format, category lifecycle, or Import Center behavior.

## Filter matrix

- All: Subjects, Grade Levels, Languages, Language Levels, Purpose Tags, Focus Tags
- Activities: shared families plus Activity Types
- Resources: shared families plus Resource Formats
- Assessments: shared families
- Legacy Standards: no Library classification facets

## Semantics

- Values within one family combine with OR.
- Different families combine with AND.
- Search, status, and generic tags are applied before classifications.
- Counts are disjunctive: each family is counted after all other selected families are applied.
- Facets use stable category IDs, never labels or aliases.
- Only active values are offered. Archived and merged values remain readable on existing items but
  cannot be selected as filters.
- Zero-count values are hidden unless they are currently selected.
- Switching tabs preserves compatible selections and removes incompatible selections.
- Clear filters preserves the current Library tab.

## State and compatibility

The Library tab remains URL-backed. Search, status, generic tag, and classification selections are
session-local state, matching existing Library behavior. Reload restores the tab and resets local
filters. Browser Back/Forward continues to navigate tabs.

Resource Format filtering now uses the same canonical facet model as all other classifications.
Generic tags remain separate.

No database migration, backup migration, ImportRun change, or content rewrite is required.

## Accessibility and responsive behavior

Facet groups use semantic fieldsets and legends. Each checkbox has an accessible name containing
its value and count. The mobile layout collapses to one column at 390px, preserves selected state
without relying on color, and remains covered by Axe.
