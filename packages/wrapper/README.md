# @consensus-tools/wrapper

Runtime decision firewall — wraps any function with consensus gates.

## Install

```bash
pnpm add @consensus-tools/wrapper
```

## Usage

```typescript
import { consensus } from "@consensus-tools/wrapper";

const safeDeploy = consensus(deploy, {
  reviewers: [securityReview, complianceReview],
  strategy: { type: "approval-vote", quorum: 2 },
});

// Runs deploy only if consensus is reached
const result = await safeDeploy(deployArgs);
```

## What's included

- **`consensus()`** — main wrapper function with strategy and lifecycle hooks
- **`aggregateScores`** — score aggregation utility
- **Types** — `ConsensusOptions`, `ReviewerFn`, `Strategy`, `DecisionResult`, `LifecycleHooks`

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
