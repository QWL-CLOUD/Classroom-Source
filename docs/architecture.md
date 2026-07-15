# Classroom v20 Architecture

Classroom v20 is a native React + TypeScript source application. It does not enhance or patch the
legacy compiled UI.

## Layers

1. **Routes and feature UI** render typed view models.
2. **Application services** coordinate commands and queries.
3. **Domain schemas and rules** use Zod and pure functions.
4. **Repository interfaces** isolate domain code from persistence.
5. **Dexie repositories** store private domain records in IndexedDB database `classroom-v20`.

Zustand is limited to transient interface state. Domain entities are not copied into a second global
store.

## Explicitly prohibited

- MutationObserver-driven business logic
- title or visible-text matching to identify records
- overriding `Storage.prototype`
- editing generated `dist/assets` files
- full-page reload for undo/redo
- committing private backup or imported curriculum files
