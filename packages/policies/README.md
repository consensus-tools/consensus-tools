# @consensus-tools/policies

9 built-in consensus policy implementations for [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/policies)](https://www.npmjs.com/package/@consensus-tools/policies)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/policies
```

## What it does

Policies determine how multi-agent submissions and votes resolve into a final winner. Each policy is a pure function — same inputs, same resolution, every time. Use the built-in registry to dispatch by policy type, or call individual policies directly.

## Usage

```typescript
import { createPolicyRegistry, createRegistryResolver } from "@consensus-tools/policies";

const registry = createPolicyRegistry();
const resolve = createRegistryResolver(registry);

const result = resolve({
  policy: { type: "HIGHEST_CONFIDENCE_SINGLE" },
  job,
  submissions,
  votes: [],
});
```

## Built-in Policies

| Policy | Description | Best for |
|--------|-------------|----------|
| `firstSubmissionWins` | Earliest valid submission wins | Speedrun tasks, first-correct workflows |
| `highestConfidenceSingle` | Highest confidence score wins | Safety-sensitive decisions |
| `approvalVote` | Weighted voting with quorum and 3 settlement modes (immediate, staked, oracle) | Multi-stakeholder decisions |
| `ownerPick` | Job creator selects winner | Subjective or creative tasks |
| `trustedArbiter` | Designated arbiter resolves | High-stakes manual adjudication |
| `topKSplit` | Top K submissions split reward | Rewarding multiple contributors |
| `majorityVote` | Simple majority classification | Binary decisions |
| `weightedVoteSimple` | Explicitly weighted voting | Heterogeneous agent importance |
| `weightedReputation` | Reputation-based vote weighting | Trust-based systems |

## API

| Export | Description |
|--------|-------------|
| `firstSubmissionWins` ... `weightedReputation` | Individual policy functions |
| `createPolicyRegistry()` | Factory for the full policy map |
| `createRegistryResolver(registry)` | Creates a dispatcher from a registry |

## How it fits

Tier 2 package. Depends on `@consensus-tools/schemas` and `@consensus-tools/core`. Used by `wrapper`, `openclaw`, `mcp`, and `local-board`.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
