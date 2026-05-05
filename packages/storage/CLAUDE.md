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

## Code Style

- Optional native deps (e.g., `better-sqlite3`) load via `createRequire()`. Wrap in try/catch and throw an install-instruction error with `{ cause: err }`.
- All multi-step state changes go through `update<T>(fn)` so the mutex holds across read+modify+write. Never call `getState()` then `saveState()` outside `update()` — that's a race condition.
- Atomic writes only — write to `${path}.tmp` then rename. A crash mid-write must not corrupt the file.
- Corrupt JSON throws a clear `consensus-tools: storage file corrupt at <path>` error with the original `cause`. Never silently reset state — the operator needs to choose recovery.
- The `IStorage` interface is the contract; backends must satisfy it identically. New backend? Add a backend-parity test that runs the same scenarios against memory/json/sqlite.
- `applyStorageCaps()` trims FIFO — keep most recent. Don't add policies here; caps are dumb on purpose.
