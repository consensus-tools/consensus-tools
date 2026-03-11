# @consensus-tools/policies

9 built-in consensus policy implementations for [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/policies)](https://www.npmjs.com/package/@consensus-tools/policies)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/policies
```

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

| Policy | Description |
|--------|-------------|
| `firstSubmissionWins` | Earliest valid submission wins |
| `highestConfidenceSingle` | Highest confidence score wins |
| `approvalVote` | Weighted voting with quorum |
| `ownerPick` | Job creator selects winner |
| `trustedArbiter` | Designated arbiter resolves |
| `topKSplit` | Top K submissions split reward |
| `majorityVote` | Simple majority voting |
| `weightedVoteSimple` | Explicitly weighted voting |
| `weightedReputation` | Reputation-based vote weighting |

## Key Exports

- Individual policy functions (e.g., `firstSubmissionWins`, `approvalVote`)
- **`createPolicyRegistry()`** — factory for the full policy map
- **`createRegistryResolver()`** — creates a dispatcher from a registry

## Documentation

See the [consensus-tools monorepo](https://github.com/consensus-tools/consensus-tools) for full documentation.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
