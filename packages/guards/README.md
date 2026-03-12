# @consensus-tools/guards

Guard evaluation engine — deterministic evaluators, weighted voting, and three-step decision logic for [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/guards)](https://www.npmjs.com/package/@consensus-tools/guards)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/guards
```

## What it does

Guards are action-specific policy gates that evaluate whether an agent action should proceed. Each guard type (e.g., `send_email`, `code_merge`, `deployment`) defines its own risk profile, quorum requirements, and escalation thresholds.

The engine collects votes from evaluators, weights them by reputation or explicit weight, and applies a three-step decision model to produce one of four outcomes: `ALLOW`, `BLOCK`, `REWRITE`, or `REQUIRE_HUMAN`.

## Guard types

7 built-in guard types cover common agent actions:

| Guard | What it evaluates |
|-------|-------------------|
| `send_email` | Recipient allowlists, attachment policy, secrets scanning |
| `code_merge` | Sensitive file patterns, required reviewers, protected branches, CI status |
| `publish` | Profanity filters, PII detection, blocked words |
| `support_reply` | Escalation keywords, customer tier weighting, auto-escalation |
| `agent_action` | Irreversibility, tool allowlists/blocklists |
| `deployment` | Environment (dev/staging/prod), rollout strategy, rollback capability |
| `permission_escalation` | Break-glass flags, escalation levels, MFA requirements |

## Decision model

The three-step weighted decision model:

1. **Risk exceeds threshold** — If combined risk score exceeds the guard's `hitlRequiredAboveRisk`, any `NO` vote triggers `BLOCK`. Majority `REWRITE` votes produce `REWRITE`. Otherwise `BLOCK`.
2. **Quorum not met** — If fewer votes than the guard's `quorum` requirement, escalate to `REQUIRE_HUMAN`.
3. **Risk acceptable + quorum met** — `ALLOW`.

## Vote weighting

Three modes for computing effective vote weight:

- **Static** — All votes weighted equally
- **Reputation** — Weight = agent reputation score (0-100) / 100
- **Hybrid** — Weight = explicit weight multiplied by reputation / 100

## Usage

```typescript
import { computeDecision, evaluatorVotes, normalizeGuardType } from "@consensus-tools/guards";

const guardType = normalizeGuardType("code_merge");
const votes = evaluatorVotes(guardType, { files: ["src/auth.ts"] });

const decision = computeDecision(votes, {
  quorum: 0.7,
  hitlRequiredAboveRisk: 0.7,
});
// decision → "REWRITE" (touching auth file triggers elevated risk)
```

## API

| Export | Description |
|--------|-------------|
| `computeDecision(votes, policy)` | Three-step decision from weighted votes |
| `finalizeVotes(votes, policy)` | Aggregate votes into a final guard result |
| `evaluatorVotes(guardType, payload)` | Built-in deterministic evaluators |
| `tallyVotes(votes)` | Count YES/NO/REWRITE votes |
| `reachesQuorum(tally, quorum)` | Check if vote tally meets quorum |
| `computeEffectiveWeight(vote, mode)` | Compute weight for a single vote |
| `normalizeGuardType(type)` | Normalize guard type string |
| `GuardEvaluatorRegistry` | Pluggable evaluator registry class |
| `createGuardEvaluatorRegistry()` | Factory for evaluator registry |

## How it fits

Tier 1 package. Depends on `@consensus-tools/schemas`. Used by `core` (GuardEngine), `workflows` (guard nodes), and `mcp` (guard tools).

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
