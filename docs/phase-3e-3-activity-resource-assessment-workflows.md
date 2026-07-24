# Phase 3E-3 — Activity, Resource, and Assessment Workflows

## Verified baseline

- Branch: `phase-3e-3-activity-resource-assessment-workflows`
- Starting `main` / `origin/main`: `0f8f17b6c63699522c6b26224997ec715bd34b30`
- Phase 3E-2 feature commit: `a31cdf9d821ec9ba458ab1de45bd34bae1ff94f4`
- Phase 3E-2 merge: PR #55

## Scope

This phase turns the stable Library Catalog records from Phase 3E-2 into reusable teaching inputs for Planning and Lesson Flow.

### Catalog workflows

- **Activity**: grouping, estimated duration, and reusable directions.
- **Resource**: source/location and preparation or usage notes. Resource Format continues to use the shared Category vocabulary.
- **Assessment**: assessment kind, student prompt, and evidence to collect.
- **Standard**: stable Catalog records remain visible, but Planning alignment is reserved for Phase 3F.

Existing Phase 3E-2 records remain valid. Missing typed fields are normalized to safe defaults when a non-Standard record is edited or created; no IndexedDB version change is required.

### Planning application model

Plans, session content overrides, and individual Lesson Flow steps may contain `libraryLinks`.

A normal application stores only:

- `libraryItemId`
- `catalogType`

The title, description, and typed workflow fields continue to resolve from the Catalog source record. Editing a source therefore updates every live application without copying or replacing the plan.

A teacher may explicitly choose **Freeze current version**. That application still keeps the stable source ID, but also stores a snapshot containing the source title, description, typed fields, source update time, and capture time. Snapshots are application-level teaching history, not duplicate Catalog records.

### Lifecycle behavior

- Active Catalog records can be newly attached.
- Archived Catalog records remain readable on existing plans and steps.
- Archiving a source does not detach or destroy applications.
- Missing or type-mismatched links are rejected during transactional plan/session saves.
- Standards cannot be attached before Phase 3F.
- Library source edits and Planning applications remain separate undoable commands.

## Transaction and history boundaries

- Library typed fields are serialized inside the existing Library Catalog command pair.
- Plan and session `libraryLinks` are serialized inside the existing Planning command pair.
- Dexie transactions include `libraryItems` when validating links.
- Existing global Undo/Redo restores or reapplies the full plan, session override, source record, and snapshot state.
- No second link table and no destructive cascade were added.

## User-facing acceptance

1. Create or edit each Activity, Resource, and Assessment workflow and reload the Library.
2. Search the Library using a typed workflow field.
3. Attach a live Resource to a whole lesson.
4. Attach an Activity to an instructional step.
5. Change a step to Assessment and attach an Assessment from the prioritized picker.
6. Edit a live Catalog source and confirm its application resolves the updated source.
7. Freeze an application, edit the source, and confirm the frozen application retains its captured version.
8. Archive a source and confirm existing applications remain visible with an archived-source cue.
9. Save a plan or custom session override, then Undo and Redo the change.
10. Verify mobile layout, keyboard operation, focus visibility, and automated accessibility checks.

## Required verification before commit

```bash
npm run check
npm run test:e2e
git diff --check
git status --short
```

The new unit coverage increases the expected Vitest suite from 69 files / 274 tests to 70 files / 280 tests. The new Playwright workflow increases the expected browser suite from the previously confirmed 51 tests to 52 tests, assuming no unrelated tests are added concurrently.

## Explicit non-goals

- Lesson Templates, which remain Phase 3E-4.
- Standards import, alignment, or coverage, which remain Phase 3F.
- File upload, Google Drive synchronization, or external storage integration.
- Destructive Library deletion or cascading removal from plans and history.
- Full Activity procedure builders or Assessment rubric builders.
