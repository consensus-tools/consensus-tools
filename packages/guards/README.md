# @consensus-tools/guards

Guard evaluation and voting logic for consensus-tools.

## Install

```bash
pnpm add @consensus-tools/guards
```

## Usage

```typescript
import { createGuardEvaluatorRegistry, tallyVotes, reachesQuorum } from "@consensus-tools/guards";

const registry = createGuardEvaluatorRegistry();
const tally = tallyVotes(votes);
const passed = reachesQuorum(tally, policy);
```

## What's included

- **Evaluator registry** — `createGuardEvaluatorRegistry`, `EvaluatorFn`
- **Vote tallying** — `tallyVotes`, `computeEffectiveWeight`, `reachesQuorum`
- **Decision logic** — `finalizeVotes`, `computeDecision`, `normalizeGuardType`

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
