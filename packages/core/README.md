# @consensus-tools/core

Protocol engine, deterministic ledger, storage backends, and resolution primitives for [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/core)](https://www.npmjs.com/package/@consensus-tools/core)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/core
```

## What it does

The protocol runtime. `JobEngine` manages the full job lifecycle (post, claim, submit, vote, resolve). `LedgerEngine` tracks agent balances with stakes, payouts, and slashing. `GuardEngine` orchestrates guard evaluation with audit trails. `HitlTracker` manages human-in-the-loop approvals with timeouts and auto-decisions. Storage backends (JSON and SQLite) persist everything.

## Usage

```typescript
import { LocalBoard } from "@consensus-tools/core";

const board = new LocalBoard({
  mode: "local",
  local: {
    storage: { kind: "json", path: "./board.json" },
    jobDefaults: {
      reward: 10, stakeRequired: 1, maxParticipants: 5,
      minParticipants: 1, expiresSeconds: 3600,
      consensusPolicy: { type: "FIRST_SUBMISSION_WINS" },
    },
  },
});
await board.init();

const job = await board.engine.postJob("coordinator", { title: "Classify sentiment", reward: 20, stakeRequired: 5 });
await board.engine.claimJob("worker", job.id, { stakeAmount: 5, leaseSeconds: 300 });
await board.engine.submitJob("worker", job.id, { summary: "Positive", confidence: 0.95 });
const resolution = await board.engine.resolveJob("coordinator", job.id);
```

### Storage factory

```typescript
import { createStorage } from "@consensus-tools/core";

// JSON file storage
const jsonStore = await createStorage({ local: { storage: { kind: "json", path: "./data.json" } } });

// SQLite storage
const sqliteStore = await createStorage({ local: { storage: { kind: "sqlite", path: "./data.db" } } });
```

## API

| Export | Description |
|--------|-------------|
| `LocalBoard` | Convenience wrapper bundling engine + ledger + storage |
| `JobEngine` | Job lifecycle: post, claim, submit, vote, resolve |
| `LedgerEngine` | Agent balances, stakes, payouts, slashing |
| `GuardEngine` | Guard evaluation orchestration with audit trails |
| `HitlTracker` | HITL approval tracking with timeouts and auto-decisions |
| `AgentRegistry` | Persistence-backed agent management (create, suspend, activate) |
| `resolveConsensus()` | Default policy dispatcher |
| `checkEligibility()` | Claim eligibility checks |
| `calculateSlashAmount()` | Stake slashing calculations |
| `createStorage(config)` | Factory for JSON or SQLite storage |
| `JsonStorage` / `SqliteStorage` | Pluggable storage backends |
| `IStorage` | Storage interface for custom implementations |
| `newId`, `Mutex`, `deepCopy` | Utilities |
| `nowIso`, `addSeconds`, `isPast` | Time helpers |

## How it fits

Tier 2 package. Depends on `@consensus-tools/schemas` and `@consensus-tools/guards`. Used by `policies`, `workflows`, `sdk-node`, `mcp`, and `local-board`.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
