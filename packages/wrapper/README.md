# @consensus-tools/wrapper

Wrap any async function with a consensus gate. Multiple reviewers score the output, and a strategy (unanimous, majority, or threshold) decides whether to allow, block, retry, or escalate.

## Install

```bash
pnpm add @consensus-tools/wrapper
```

## Quick Start

```typescript
import { consensus } from "@consensus-tools/wrapper";

const safeDeploy = consensus({
  name: "deploy-to-prod",
  fn: deploy,
  reviewers: [securityReview, complianceReview],
  strategy: { strategy: "threshold", threshold: 0.7 },
  maxRetries: 2,
});

const result = await safeDeploy(env, version);
// result.action => "allow" | "block" | "retry" | "escalate"
// result.output => the return value of deploy()
// result.scores => [{ score: 0.9, rationale: "..." }, ...]
// result.aggregateScore => 0.85
```

## Writing Reviewers

A reviewer receives the function output and context, and returns a score (0-1):

```typescript
import type { ReviewerFn } from "@consensus-tools/wrapper";

const securityReview: ReviewerFn<DeployResult> = async (output, ctx) => {
  if (output.touchesProdDb) return { score: 0.1, rationale: "Modifies prod DB", block: true };
  return { score: 0.9, rationale: "Safe change" };
};
```

Setting `block: true` on any reviewer immediately blocks regardless of strategy.

## Strategies

| Strategy | Passes when... |
|---|---|
| `"threshold"` | Average score >= threshold (default 0.5) |
| `"majority"` | More than half of reviewers score >= threshold |
| `"unanimous"` | Every reviewer scores >= threshold |

```typescript
consensus({
  name: "risky-op",
  fn: riskyOp,
  reviewers: [r1, r2, r3],
  strategy: { strategy: "unanimous", threshold: 0.8 },
});
```

## Lifecycle Hooks

```typescript
consensus({
  name: "managed-op",
  fn: myFn,
  reviewers: [r1],
  hooks: {
    beforeSubmit: (args) => console.log("About to call fn with", args),
    afterResolve: (result) => audit.log("Allowed", result),
    onBlock: (result) => alert("Blocked!", result.scores),
    onEscalate: (result) => pagerduty.trigger(result),
  },
});
```

## aggregateScores (Advanced)

Use the aggregation logic directly without the wrapper:

```typescript
import { aggregateScores } from "@consensus-tools/wrapper";

const decision = aggregateScores(
  scores,                                    // ReviewResult[]
  output,                                    // the value being evaluated
  1,                                         // attempt number
  { strategy: "majority", threshold: 0.6 },  // strategy config
  2,                                         // maxRetries
);
// decision.action => "allow" | "block" | "retry" | "escalate"
```

## Exports

| Export | Description |
|---|---|
| `consensus(opts)` | Wrap a function with a consensus gate; returns an async function |
| `aggregateScores(scores, output, attempt, config, maxRetries)` | Score aggregation utility |
| `ConsensusOptions` | Options for `consensus()` |
| `ReviewerFn<T>` | Reviewer function type |
| `ReviewContext` | Context passed to reviewers (name, args, attempt) |
| `ReviewResult` | Reviewer return type (score, rationale, block) |
| `Strategy` | `"unanimous" \| "majority" \| "threshold"` |
| `StrategyConfig` | Strategy + threshold |
| `DecisionResult<T>` | Final decision (action, output, scores, aggregateScore) |
| `LifecycleHooks<T>` | Hook functions for beforeSubmit, afterResolve, onBlock, onEscalate |

## Looking for a simpler entry point?

[`@consensus-tools/universal`](../universal) wraps this package with sensible defaults — built-in guard reviewers and fail-safe behavior out of the box. Use `universal` for quick setup; use `wrapper` directly when you need full control over reviewers and strategies.

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/toolkit)
