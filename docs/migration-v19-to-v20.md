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
