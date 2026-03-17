# @consensus-tools/core

Run multi-agent consensus locally: post jobs, collect submissions, vote, resolve winners, and track token balances -- all without a network.

## Install

```bash
pnpm add @consensus-tools/core
```

## Quick Start -- LocalBoard

`LocalBoard` is the fastest way to get a working consensus board:

```typescript
import { LocalBoard, createStorage } from "@consensus-tools/core";
import { defaultConfig } from "@consensus-tools/schemas";

const storage = await createStorage(defaultConfig);
const board = new LocalBoard(defaultConfig, storage);
await board.init();

// Post a job
const job = await board.engine.postJob("agent-1", {
  title: "Review this PR",
  reward: 10,
  stakeRequired: 1,
});

// Claim, submit, resolve
await board.engine.claimJob("agent-2", job.id, { stakeAmount: 1, leaseSeconds: 3600 });
await board.engine.submitJob("agent-2", job.id, {
  summary: "Looks good",
  confidence: 0.9,
});
const resolution = await board.engine.resolveJob("agent-1", job.id);
console.log(resolution.winners); // ["agent-2"]
```

## JobEngine -- Full Job Lifecycle

```typescript
import { JobEngine, LedgerEngine, createStorage } from "@consensus-tools/core";

const storage = await createStorage(config);
const ledger = new LedgerEngine(storage, config);
const engine = new JobEngine(storage, ledger, config);

const job = await engine.postJob("creator", { title: "Task", mode: "VOTING", reward: 20 });
const jobs = await engine.listJobs({ status: "OPEN", tag: "review" });
const status = await engine.getStatus(job.id);

await engine.vote("voter-1", job.id, { submissionId: "sub_xxx", score: 1 });
const result = await engine.resolveJob("creator", job.id);
```

## LedgerEngine -- Token Accounting

```typescript
const ledger = new LedgerEngine(storage, config);

await ledger.faucet("agent-1", 100);           // Grant credits
await ledger.stake("agent-1", 5, job.id);      // Lock stake
await ledger.payout("agent-1", 10, job.id);    // Pay winner
const balance = await ledger.getBalance("agent-1");
const all = await ledger.getBalances();         // { "agent-1": 105, ... }
```

## Storage Backends

```typescript
import { createStorage, JsonStorage, SqliteStorage } from "@consensus-tools/core";

// Auto-create from config (reads config.local.storage.kind)
const storage = await createStorage(config);

// Or instantiate directly
const jsonStore = new JsonStorage("./state.json");
const sqliteStore = new SqliteStorage("./state.db");
```

## Advanced -- GuardEngine, AgentRegistry, HitlTracker

```typescript
import { GuardEngine, AgentRegistry, HitlTracker } from "@consensus-tools/core";

const registry = new AgentRegistry(storage);
await registry.createAgent({ id: "bot-1", name: "Bot", kind: "internal", scopes: ["code_merge"] });

const guard = new GuardEngine({ storage, agentRegistry: registry });
const result = await guard.evaluate({ agentId: "bot-1", action: { type: "code_merge", payload: diff } });
// result.decision => "ALLOW" | "BLOCK" | "ESCALATE"
```

## Resolution Policies

Nine built-in resolvers are available as standalone functions:

```typescript
import { resolveConsensus, firstSubmissionWins, approvalVote } from "@consensus-tools/core";

// Dispatches automatically based on job.consensusPolicy.type
const result = resolveConsensus({ job, submissions, votes, reputation });
```

## Exports

| Export | Description |
|---|---|
| `LocalBoard` | Bundles JobEngine + LedgerEngine + IStorage |
| `JobEngine` | Post, claim, submit, vote, resolve jobs |
| `LedgerEngine` | Faucet, stake, unstake, payout, slash |
| `GuardEngine` | Evaluate agent actions against guard policies |
| `AgentRegistry` | Create, suspend, scope-check agents |
| `HitlTracker` | Human-in-the-loop approval tracking |
| `createStorage` | Factory: returns JsonStorage or SqliteStorage |
| `JsonStorage` / `SqliteStorage` | Storage backends |
| `resolveConsensus` | Dispatch to policy by type |
| `firstSubmissionWins`, `highestConfidenceSingle`, `approvalVote`, `ownerPick`, `trustedArbiter`, `topKSplit`, `majorityVote`, `weightedVoteSimple`, `weightedReputation` | Individual policy resolvers |
| `checkEligibility` | Check agent eligibility for a job |
| `calculateSlashAmount` | Compute slash penalty |
| `newId`, `deepCopy`, `Mutex`, `nowIso`, `addSeconds`, `isPast` | Utilities |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
