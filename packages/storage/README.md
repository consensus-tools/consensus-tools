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

For most use cases, instantiate a storage backend directly:

```typescript
import { JsonStorage, SqliteStorage, MemoryStorage } from "@consensus-tools/storage";

const json = new JsonStorage("./state.json");
const sqlite = new SqliteStorage("./state.db");
const memory = new MemoryStorage();

await memory.init(); // all backends require init()
```

### Factory (config-driven)

`createStorage` takes a full `ConsensusToolsConfig` and reads `config.local.storage.kind` to pick the backend:

```typescript
import { createStorage } from "@consensus-tools/storage";

// config must be a full ConsensusToolsConfig with config.local.storage.kind set
const storage = await createStorage(config);
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
