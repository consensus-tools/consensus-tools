# @consensus-tools/policies

Built-in consensus policy implementations for consensus-tools.

## Install

```bash
pnpm add @consensus-tools/policies
```

## Usage

```typescript
import { createPolicyRegistry, createRegistryResolver } from "@consensus-tools/policies";

const registry = createPolicyRegistry();
const resolver = createRegistryResolver(registry);

// Resolve consensus using configured policy
const result = resolver(input);
```

## Included policies

- `firstSubmissionWins` — first valid submission wins
- `highestConfidenceSingle` — highest confidence score
- `approvalVote` — quorum-based approval voting
- `majorityVote` — simple majority
- `weightedVoteSimple` / `weightedReputation` — weighted voting
- `ownerPick` — job owner selects winner
- `trustedArbiter` — delegated arbiter decision
- `topKSplit` — split reward among top K

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
