# @consensus-tools/core

Protocol engine, ledger, storage, and resolution primitives for consensus-tools.

## Install

```bash
pnpm add @consensus-tools/core
```

## Usage

```typescript
import { JobEngine, createStorage, LedgerEngine } from "@consensus-tools/core";

const storage = createStorage();
const engine = new JobEngine(storage);
const ledger = new LedgerEngine(storage);

// Post a job and resolve consensus
const job = await engine.postJob({ title: "Review PR", mode: "open" });
```

## What's included

- **JobEngine** — full job lifecycle (post, claim, submit, vote, resolve)
- **LedgerEngine** — token accounting with `computeBalances` and `getBalance`
- **Storage** — `IStorage` interface with `JsonStorage` and `SqliteStorage` backends
- **LocalBoard** — in-process consensus board
- **Resolution** — `resolveConsensus` policy dispatch
- **Utilities** — `newId`, `Mutex`, `deepCopy`, `nowIso`

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
