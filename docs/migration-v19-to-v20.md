# v19 → v20 Migration Contract

1. A legacy backup is read-only input.
2. Scanning does not write domain records.
3. Every decoded record is counted and validated before a commit workflow exists.
4. Failed records will be copied into v20 quarantine with source metadata during a future commit phase.
5. Commit will use a single IndexedDB transaction.
6. Old `cos-*` localStorage keys are never changed or deleted.
7. A migration run will support rollback of records created by that run.
8. Private source files are never committed to the public repository.

## Phase 1B detailed preview

Phase 1B reads each recognized store independently. One malformed store does not stop the rest of
the report. The preview displays only store names, counts, destinations, decisions, and anonymous
validation warnings.

Directly mapped stores are marked **Ready**. Lesson and template records are marked **Review**
until plan/session/series classification is implemented. Toolkit and standards records are marked
**Deferred**, not skipped, until their v20 tables exist. Existing calendar quarantine records remain
**Quarantine** and never re-enter the active calendar automatically.

The Phase 1B scanner is a pure in-memory operation and reports zero IndexedDB write operations.

## Phase 1C reversible migration plan

Phase 1C converts supported legacy records into in-memory v20 draft operations. It still performs no
IndexedDB writes. Every planned `create` or `quarantine` operation receives a matching inverse
`delete` operation in the rollback manifest.

The plan currently prepares:

- the active school year required by learner contexts;
- Class, Group, and Individual records as `learnerContexts`;
- group memberships when referenced learners are present;
- schedule definitions as `scheduleBlocks`;
- valid active events as `calendarEvents`;
- shared Today/Tasks records as `tasks`;
- classifiable lessons as `lessonPlans` and dated `sessionOccurrences`;
- legacy calendar quarantine records as new `quarantineRecords`.

Records that need human classification remain **Review**. Toolkit and Standards records remain
**Deferred** with their source JSON preserved in memory. Missing identifiers and duplicate target
identifiers are **Skipped**. Conversion failures with a stable source identifier are planned for
**Quarantine**, never silently discarded.

The source backup is never mutated. The plan shows only anonymous counts, destination tables, a
source fingerprint, and rollback coverage. Full private record content is not rendered in the UI.
Commit and rollback execution remain disabled until the next phase adds a single-transaction commit
workflow and explicit user confirmation.

## Phase 1D safe execution and rollback

Phase 1D enables the write step only after the user generates a plan and checks an explicit local
write confirmation. Commit performs preflight conflict detection, restore-point capture, record
insertion, post-write verification, and migration-run persistence inside one Dexie transaction.
Any thrown error aborts the transaction, leaving zero partial domain writes.

An existing v20 record with the same identifier is handled conservatively:

- an identical record is reused and excluded from rollback deletion;
- a different record blocks the entire commit before any record is inserted.

The local `migrationRuns` record stores a private recovery manifest containing the source
fingerprint, inserted identifiers, identical reused identifiers, before-images, and verified table
counts. This manifest never appears in the public repository and the UI renders only anonymous
counts and run identifiers.

Manual rollback runs in one transaction. It deletes only records inserted by that migration run and
only when their current content still matches the committed snapshot. A migrated record changed
after commit blocks the complete rollback, preventing accidental deletion of newer user edits.
Legacy `cos-*` localStorage keys remain read-only throughout commit and rollback.
