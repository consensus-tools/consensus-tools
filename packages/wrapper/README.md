# @consensus-tools/wrapper

Runtime decision firewall — wraps any function with consensus gates. Part of [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/wrapper)](https://www.npmjs.com/package/@consensus-tools/wrapper)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/wrapper
```

## What it does

Wraps any async function with a multi-reviewer consensus gate. Reviewers (human or AI) independently evaluate the call. The strategy aggregates their scores and decides whether to allow, block, or escalate. Lifecycle hooks fire at each stage.

## Usage

```typescript
import { consensus } from "@consensus-tools/wrapper";

const safeSend = consensus(sendEmail, {
  reviewers: [humanReviewer, aiSafetyReviewer],
  strategy: { mode: "unanimous" },
  hooks: {
    onBlock: (ctx) => console.log("Blocked:", ctx.reason),
    onAllow: (ctx) => console.log("Allowed:", ctx.scores),
  },
});

const result = await safeSend({ to: "user@example.com", body: "Hello" });
```

## Strategies

| Mode | Behavior |
|------|----------|
| `unanimous` | All reviewers must approve |
| `majority` | More than half must approve |
| `threshold` | Average score must exceed a numeric threshold |

## API

| Export | Description |
|--------|-------------|
| `consensus(fn, options)` | Wrap any async function with reviewer-based consensus |
| `aggregateScores(scores, strategy)` | Compute aggregate decision from reviewer scores |
| `ConsensusOptions` | Configuration type for consensus wrapper |
| `ReviewerFn` | Reviewer function signature |
| `ReviewContext` / `ReviewResult` | Reviewer input/output types |
| `Strategy` / `StrategyConfig` | Strategy configuration |
| `DecisionResult` | Final allow/block decision |
| `LifecycleHooks` | Hook callbacks (onAllow, onBlock, onEscalate) |

## How it fits

Tier 3 package. Depends on `@consensus-tools/schemas`. Used by `mcp` for guard wrapping.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
