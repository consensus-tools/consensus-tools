# @consensus-tools/storage

Storage backends for consensus-tools. Provides the `IStorage` interface and three implementations: JSON file, SQLite, and in-memory.

## Install

```bash
pnpm add @consensus-tools/storage
```

Peer dependency: `@consensus-tools/schemas`

## Storage Backends

| Backend | Persistence | Best for |
|---------|------------|----------|
| `JsonStorage` | File (JSON) | Local development, single-process deployments |
| `SqliteStorage` | SQLite database | Production use with concurrent access |
| `MemoryStorage` | In-memory (lost on exit) | Tests, quick prototyping, CI environments |

## Quick Start

```typescript
import { createStorage } from "@consensus-tools/storage";

// JSON file storage
const json = await createStorage({ storage: { kind: "json", path: "./state.json" } });

// SQLite storage
const sqlite = await createStorage({ storage: { kind: "sqlite", path: "./state.db" } });

// In-memory storage (no persistence — data lost on process exit)
const memory = await createStorage({ storage: { kind: "memory" } });
```

## Direct Usage

```typescript
import { JsonStorage, SqliteStorage, MemoryStorage } from "@consensus-tools/storage";

const store = new MemoryStorage();
await store.init();

// Read/write state
const state = await store.getState();
await store.saveState(state);

// Atomic updates with mutex protection
const { state: updated, result } = await store.update((current) => {
  current.jobs.push(newJob);
  return newJob.id;
});
```

## IStorage Interface

All backends implement this contract:

```typescript
interface IStorage {
  init(): Promise<void>;
  getState(): Promise<StorageState>;
  saveState(state: StorageState): Promise<void>;
  update<T>(fn: (state: StorageState) => T | Promise<T>): Promise<{ state: StorageState; result: T }>;
}
```

## Exports

| Export | Description |
|---|---|
| `createStorage(config)` | Factory — creates the right backend from config |
| `JsonStorage` | File-based JSON storage |
| `SqliteStorage` | SQLite-based storage |
| `MemoryStorage` | In-memory storage for dev/test |
| `IStorage` | Storage interface type |
| `StorageCaps` | Storage capacity limits type |
| `defaultState()` | Returns an empty default `StorageState` |
| `applyStorageCaps(state, caps)` | Trim state to capacity limits |
| `Mutex` | Mutex for concurrent access control |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
