# @consensus-tools/guards

Deterministic guard evaluation engine. Evaluates agent actions against 9 built-in guard types using pattern-matching rules, then tallies votes to produce a decision (ALLOW/BLOCK/REWRITE/REQUIRE_HUMAN).

## Key Exports

- `evaluatorVotes(input)` — dispatch to guard-specific evaluators, returns `GuardVote[]`
- `computeDecision()` — multi-agent weighted voting with quorum + risk threshold
- `finalizeVotes()` — single-evaluator decision finalization
- `tallyVotes()` — aggregate votes by type (YES/NO/REWRITE)
- `detectHardBlockFlags()` — regex-based hard-block pattern detection
- `GuardEvaluatorRegistry` — pluggable evaluator storage
- `createGuardTemplate()` — reusable guard config factory

## Architecture

- Switch-based dispatch in `evaluatorVotes()` by `action.type`
- `WeightedGuardVote` adds weight, confidence, reputation fields for multi-agent consensus
- Risk scores are 0–1; combined risk > threshold blocks

## Gotchas

- Unknown guard types return `vote: "YES"` with low risk (0.2) — they don't throw.
- Adding a new guard type to schemas requires updating the evaluatorVotes() switch.
- `detectHardBlockFlags()` is regex-based — ensure the flag list is comprehensive.
- Reputation is optional on `WeightedGuardVote`; defaults to 100 in voting.
