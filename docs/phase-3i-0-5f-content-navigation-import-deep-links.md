# Phase 3I-0.5F — CONTENT Navigation and Canonical Import Deep Links

## Scope

Phase 3I-0.5F closes the information architecture around the existing canonical Import Center.

The visible navigation group is renamed from **Resources** to **Content** while its stable internal
group ID remains `resources`. Existing navigation-collapse preferences therefore remain compatible.

```text
CONTENT
├── Library
├── Lesson Templates
├── Standards
└── Categories & Labels

SETTINGS & DATA
└── Import Center
```

Classroom continues to have one canonical Import Center at `#/import`. Content and roster
workspaces link to it; they do not create duplicate routes, preview state, transactions, import
history, or Undo/Redo systems.

## Canonical deep links

```text
Library / Activities  → #/import?type=activities
Library / Resources   → #/import?type=resources
Library / Assessments → #/import?type=assessments
Standards             → #/import?type=standards
Class or Group roster → #/import?type=roster&context=<context-id>
```

The existing Import Center route state remains authoritative. Roster context kind is resolved from
the canonical context record; no parallel `contextType` parameter is introduced.

## Library route state

Library catalog tabs gain canonical URL state:

```text
#/library
#/library?tab=activities
#/library?tab=resources
#/library?tab=assessments
#/library?tab=legacy-standards
```

The selected tab survives reload and participates in browser Back/Forward history. Unknown, empty,
or repeated `tab` values safely fall back to **All** without writing data.

Contextual import actions appear only for Activities, Resources, and Assessments. All and Legacy
Standards do not expose an ambiguous generic content import action.

Successful Activity and Resource imports now return directly to the corresponding Library tab.
Assessment imports already use the canonical Assessments tab link.

## Roster wording

Active Class and Group roster workspaces use the consistent action label **Import roster**. Individual
planning contexts remain outside roster import. Empty roster guidance reflects both supported source
methods: file or pasted table.

## Explicit non-goals

This phase does not change:

- database version or schemas;
- importer parsers, mappings, previews, mutation services, ImportRun, or global Undo/Redo;
- classification creation, aliases, or import-time classification resolution;
- Calendar Events, Assessment Evidence, Lesson Templates, or document import;
- Categories & Labels data;
- Standards identities or alignments.

## Verification expectations

- CONTENT contains Library, Lesson Templates, Standards, and Categories & Labels.
- Import Center remains under SETTINGS & DATA.
- Library tab state survives reload and browser history.
- Contextual links open the correct existing importer.
- Class and Group roster links preselect the canonical context.
- Individual contexts expose no roster import.
- Invalid Library tab state safely returns to All.
- Desktop, compact viewport, keyboard, and axe checks pass.
- Existing importer regression suites remain green.
