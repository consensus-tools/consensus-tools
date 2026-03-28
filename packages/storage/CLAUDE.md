# @consensus-tools/storage

Abstraction layer for state persistence. `IStorage` interface with three backends.

## Backends

- `JsonStorage(path)` — atomic writes (temp file + rename)
- `SqliteStorage(dbPath)` — prepared statements, requires optional `better-sqlite3` peer dep
- `MemoryStorage()` — ephemeral, always available

## Key Exports

- `IStorage` interface — `init()`, `getState()`, `saveState()`, `update<T>()`
- `createStorage(config)` — factory that picks backend from config
- `Mutex` — locking for concurrent access
- `defaultState()` — creates fully-typed empty `StorageState`
- `applyStorageCaps(state, caps)` — trims arrays keeping most recent (FIFO)

## Gotchas

- **Must call `await storage.init()` before use.**
- `update()` is the primary API — rarely use `getState()` + `saveState()` separately.
- `StorageState` is large (18 entity arrays).
- `better-sqlite3` is optional — only needed for SQLite backend.
