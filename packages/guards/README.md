# @consensus-tools/guards

Deterministic guard evaluation engine for consensus-tools. Evaluate agent actions against 7 built-in guard types, tally weighted votes across multiple evaluators, and compute ALLOW / BLOCK / REWRITE / REQUIRE_HUMAN decisions.

## Install

```bash
pnpm add @consensus-tools/guards
```

Peer dependency: `@consensus-tools/schemas`

## Basic Usage -- Single Evaluator

Run the built-in evaluators against an action and finalize a decision:

```typescript
import { evaluatorVotes, finalizeVotes } from "@consensus-tools/guards";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";

const input: GuardEvaluateInput = {
  action: { type: "code_merge", payload: { files: ["src/auth/login.ts"] } },
  context: {},
};

const votes = evaluatorVotes(input);
// => [{ evaluator: "merge-risk", vote: "REWRITE", reason: "Sensitive file touched", risk: 0.82 }]

const result = finalizeVotes(votes, "code_merge");
// => { decision: "REQUIRE_HUMAN", reason: "Sensitive file touched", risk_score: 0.82, next_step: { ... } }
```

## Multi-Agent Weighted Decisions

Use `computeDecision` for multi-evaluator consensus with weighted voting:

```typescript
import { computeDecision } from "@consensus-tools/guards";
import type { WeightedGuardVote, GuardPolicy } from "@consensus-tools/schemas";

const votes: WeightedGuardVote[] = [
  { vote: "YES", risk: 0.3, confidence: 0.9, weight: 1, reputation: 95, evaluator: "a", reason: "ok" },
  { vote: "YES", risk: 0.2, confidence: 0.8, weight: 1, reputation: 80, evaluator: "b", reason: "ok" },
  { vote: "NO",  risk: 0.9, confidence: 0.95, weight: 1, reputation: 90, evaluator: "c", reason: "risky" },
];

const policy: GuardPolicy = { quorum: 0.6, riskThreshold: 0.7 };

const { decision, tally, quorumMet, combinedRisk } = computeDecision(votes, policy, "hybrid");
// decision: "BLOCK" (combinedRisk > threshold and NO votes present)
```

Weighting modes: `"static"` (raw weight), `"reputation"` (reputation/100), `"hybrid"` (weight * reputation/100).

## Evaluator Registry

Register custom evaluators or override built-in ones:

```typescript
import { createGuardEvaluatorRegistry } from "@consensus-tools/guards";
import type { GuardEvaluateInput, GuardVote } from "@consensus-tools/schemas";

const registry = createGuardEvaluatorRegistry();
// 7 built-in types pre-registered: send_email, code_merge, publish,
// support_reply, agent_action, deployment, permission_escalation

// Override or add a custom guard type
registry.register("custom_action", (input: GuardEvaluateInput): GuardVote[] => {
  return [{ evaluator: "custom", vote: "YES", reason: "Custom check passed", risk: 0.1 }];
});

const votes = registry.evaluate({ action: { type: "custom_action", payload: {} }, context: {} });
const types = registry.listTypes(); // all registered guard types
```

## Vote Tallying Utilities

```typescript
import { computeEffectiveWeight, tallyVotes, reachesQuorum } from "@consensus-tools/guards";

// Compute a single voter's effective weight
const ew = computeEffectiveWeight(1.0, 85, "hybrid"); // => 0.85

// Tally an array of weighted votes
const tally = tallyVotes(votes, "hybrid");
// => { yes, no, rewrite, totalWeight, weightedYes, weightedNo, weightedRewrite, voterCount }

// Check if the tally meets quorum
const met = reachesQuorum(tally, 0.6);
```

## Exports Reference

| Export | Kind | Description |
|---|---|---|
| `evaluatorVotes` | Function | Built-in deterministic evaluator for all 7 guard types |
| `computeEffectiveWeight` | Function | `(weight, reputation, mode?) => number` |
| `tallyVotes` | Function | `(votes, mode?) => VoteTally` |
| `reachesQuorum` | Function | `(tally, quorum) => boolean` |
| `finalizeVotes` | Function | `(votes, actionType, policy?) => GuardResult` (single-evaluator path) |
| `computeDecision` | Function | `(votes, policy, mode?) => { decision, tally, quorumMet, ... }` (multi-agent path) |
| `normalizeGuardType` | Function | `(type) => GuardType` -- falls back to `"agent_action"` |
| `GuardEvaluatorRegistry` | Class | Registry of evaluator functions keyed by guard type |
| `createGuardEvaluatorRegistry` | Function | Factory that returns a pre-loaded registry |
| `EvaluatorFn` | Type | `(input: GuardEvaluateInput) => GuardVote[]` |

## Guard Templates

Create custom guard domains with the template system. Templates integrate with both the evaluator registry and the `@consensus-tools/wrapper` package:

```typescript
import { createGuardTemplate } from "@consensus-tools/guards";

const myGuard = createGuardTemplate("custom_review", {
  rules: (payload) => [
    { evaluator: "custom", vote: "YES", reason: "Looks good", risk: 0.1 },
  ],
  description: "Custom review guard",
});

// Use as a registry evaluator
myGuard.register(registry);

// Or use as a wrapper reviewer
const reviewer = myGuard.asReviewer();
```

> **Tip:** For the simplest integration path, use [`@consensus-tools/universal`](../universal) which composes guards + wrapper with sensible defaults.

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/toolkit)
