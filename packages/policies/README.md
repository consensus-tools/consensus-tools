# @consensus-tools/policies

Pluggable consensus policy registry with all 9 built-in resolution strategies. Use this package when you need to swap policies at runtime or register custom ones.

## Install

```bash
pnpm add @consensus-tools/policies
```

## Quick Start

```typescript
import { createPolicyRegistry, createRegistryResolver } from "@consensus-tools/policies";

const registry = createPolicyRegistry(); // pre-loaded with all 9 policies
const resolver = createRegistryResolver(registry);

// resolver dispatches based on job.consensusPolicy.type
const result = resolver({ job, submissions, votes, reputation: (agent) => 1 });
console.log(result.winners, result.consensusTrace);
```

## Register a Custom Policy

```typescript
import { createPolicyRegistry, createRegistryResolver } from "@consensus-tools/policies";

const registry = createPolicyRegistry();
registry.set("MY_CUSTOM_POLICY", (input) => {
  // Your logic here -- return { winners, winningSubmissionIds, consensusTrace, finalArtifact }
  const best = input.submissions.sort((a, b) => b.confidence - a.confidence)[0];
  return {
    winners: best ? [best.agentId] : [],
    winningSubmissionIds: best ? [best.id] : [],
    consensusTrace: { policy: "MY_CUSTOM_POLICY" },
    finalArtifact: best?.artifacts ?? null,
  };
});

const resolver = createRegistryResolver(registry);
```

## Use Individual Policies Directly

Each policy is also exported as a standalone function:

```typescript
import { approvalVote, majorityVote, topKSplit } from "@consensus-tools/policies";

const result = approvalVote({ job, submissions, votes, reputation });
```

## Built-in Policies

| Policy | Type Key | How It Resolves |
|---|---|---|
| `firstSubmissionWins` | `FIRST_SUBMISSION_WINS` | Earliest valid submission wins |
| `highestConfidenceSingle` | `HIGHEST_CONFIDENCE_SINGLE` | Submission with highest confidence score (above `minConfidence`) |
| `approvalVote` | `APPROVAL_VOTE` | Quorum-based voting with configurable weight mode, settlement, tie-breaking |
| `majorityVote` | `MAJORITY_VOTE` | Simple majority -- each vote counts equally |
| `weightedVoteSimple` | `WEIGHTED_VOTE_SIMPLE` | Votes weighted by explicit `weight` field |
| `weightedReputation` | `WEIGHTED_REPUTATION` | Votes weighted by agent reputation score |
| `ownerPick` | `OWNER_PICK` | Job creator manually selects the winner |
| `trustedArbiter` | `TRUSTED_ARBITER` | Designated arbiter agent decides |
| `topKSplit` | `TOP_K_SPLIT` | Reward split among top K submissions (by confidence or score) |

## Exports

| Export | Description |
|---|---|
| `createPolicyRegistry()` | Returns a `Map<ConsensusPolicyType, PolicyResolver>` with all built-in policies |
| `createRegistryResolver(registry?)` | Returns a `PolicyResolver` that dispatches by `job.consensusPolicy.type` |
| 9 policy functions | Re-exported from `@consensus-tools/core` for direct use |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/toolkit)
