# Phase 3I-0.5I.2 — Import Mapping Reuse & Atomic Save

## Purpose

Phase 3I-0.5I.2 connects the classification mapping presets introduced in Phase 3I-0.5I.1 to the reviewed Activities, Resources, and Assessments import flows.

The phase keeps classification vocabulary, saved import mappings, and one-time review decisions distinct:

- controlled names and aliases remain canonical classification identities;
- a saved mapping translates one external value within one classification family;
- Apply once affects only the current reviewed import;
- Save and Update persist an explicit mapping in the same transaction as the import.

## Resolver precedence

For every imported classification token, the shared resolver applies this order:

1. exact active controlled name;
2. exact active controlled alias;
3. archived, merged, or ambiguous controlled history requires review;
4. when no controlled match exists, one safe active saved mapping resolves automatically;
5. inactive or unsafe mappings require review;
6. otherwise the value remains an unknown review.

A mapping is safe only when it is active and targets an existing active controlled value in the same family. A mapping never bypasses controlled vocabulary history.

Automatic mapping use is visible in the reviewed row, for example:

```text
Saved import mapping: “ELA” → “English Language Arts”.
```

## Review behavior

Resolution and persistence are separate decisions.

### Apply once

Apply once is the default and creates no mapping record.

### Save as import mapping

Save is available only when an unknown imported value is explicitly mapped to an existing active controlled value and the family/source key is unused.

### Update and activate saved mapping

Update is available when one saved mapping already owns the family/source key. The existing mapping ID and source label are preserved while its target, status, and update time are changed.

Create controlled value, Generic Tag, Ignore, archived canonical history, merged canonical history, and canonical ambiguity remain one-time decisions and cannot persist mappings.

## No-write preview

Preview plans, but does not write:

```text
newMappingPresets
updatedMappingPresets (before/after)
expectedMappingPresets
classificationMappingAudit
```

Every mapping that influenced preview is snapshotted for stale-state validation.

## Commit validation

Inside the final import transaction, the mutation service verifies:

- expected mappings still equal their preview snapshots;
- a new mapping ID and family/source key remain unused;
- an updated mapping still equals its before snapshot;
- the target remains active and in the same family after planned category restorations;
- the source text has not become an active controlled name or alias;
- no competing mapping now owns the compound key.

A mismatch blocks commit and requires a new preview.

## Atomic transaction and Undo/Redo

Activities, Resources, and Assessments commit mapping changes together with:

```text
CategoryValues
Library items
CategoryAssignments
ImportRun
ChangeLog
```

The import command supports put and delete operations for `classificationMappingPresets`.

A newly saved mapping uses:

```text
forward: put mapping
inverse: delete mapping
```

An updated mapping uses:

```text
forward: put after snapshot
inverse: put before snapshot
```

One global Undo or Redo therefore reverses or restores the mapping and imported records together.

## Import History

`ImportRun.summaryJson` records two separate audit concepts:

- `classificationAudit` aggregates each imported value resolution, including `saved-preset` and the preset ID;
- `classificationMappingAudit` records each mapping created or updated once.

This avoids reporting one mapping creation for every source row that used the same value. The existing 100,000-character summary limit remains unchanged.

## Database and backup

```text
Database schema: v14 unchanged
Backup schema: v14 unchanged
Migration: none
Backup format: unchanged
Rollover behavior: unchanged
```

Phase 3I-0.5I.1 already made `classificationMappingPresets` a first-class database, backup, rollover, and global-history table.

## Scope

```text
30 paths
26 modified
4 new
```

The phase supports only:

```text
Activities
Resources
Assessments
```

Standards, Rosters, mapping file import/export, vendor profiles, fuzzy matching, regular expressions, wildcards, and persistent Generic Tag or Ignore decisions remain out of scope.
