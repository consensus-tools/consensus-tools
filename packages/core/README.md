# @consensus-tools/core

Protocol engine, ledger, storage, and resolution primitives for [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/core)](https://www.npmjs.com/package/@consensus-tools/core)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/core
```

## Usage

```typescript
import { LocalBoard } from "@consensus-tools/core";

const board = new LocalBoard({
  mode: "local",
  local: {
    storage: { kind: "json", path: "./board.json" },
    jobDefaults: {
      reward: 10,
      stakeRequired: 1,
      maxParticipants: 5,
      minParticipants: 1,
      expiresSeconds: 3600,
      consensusPolicy: { type: "FIRST_SUBMISSION_WINS" },
    },
  },
});
await board.init();

const job = await board.engine.postJob("agent-coordinator", {
  title: "Classify sentiment",
  reward: 20,
  stakeRequired: 5,
});

await board.engine.claimJob("agent-worker", job.id, {
  stakeAmount: 5,
  leaseSeconds: 300,
});

const sub = await board.engine.submitJob("agent-worker", job.id, {
  summary: "Positive sentiment",
  confidence: 0.95,
});

const resolution = await board.engine.resolveJob("agent-coordinator", job.id);
```

## Key Exports

- **`LocalBoard`** — convenience wrapper bundling engine + ledger + storage
- **`JobEngine`** — job lifecycle: post, claim, submit, vote, resolve
- **`LedgerEngine`** — agent balances, stakes, payouts, slashing
- **`JsonStorage`** / **`SqliteStorage`** — pluggable storage backends
- **`resolveConsensus()`** — default policy dispatcher
- **`checkEligibility()`** — claim eligibility checks
- Utilities: `newId`, `Mutex`, `deepCopy`, time helpers

## Documentation

See the [consensus-tools monorepo](https://github.com/consensus-tools/consensus-tools) for full documentation.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
