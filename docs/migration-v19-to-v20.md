# v19 → v20 Migration Contract

1. A legacy backup is read-only input.
2. Scanning does not write domain records.
3. Every decoded record will be validated with a legacy schema and then a v20 schema.
4. Failed records will be copied into v20 quarantine with source metadata.
5. Commit will use a single IndexedDB transaction.
6. Old `cos-*` localStorage keys are never changed or deleted.
7. A migration run will support rollback of records created by that run.
8. Private source files are never committed to the public repository.

Phase 0 implements only the outer-envelope scan. Record-level preview and commit are the next
milestone.
