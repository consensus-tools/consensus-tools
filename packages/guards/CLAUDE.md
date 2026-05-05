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

## Code Style

- Evaluators are **pure functions**: `(input) => GuardVote[]`. No I/O, no async, no shared module state. Determinism is the contract.
- Unknown guard types fall through to `evaluatorVotes()` default which returns `YES` at low risk (0.2). Never throw on unknown types — fail-open with low confidence is the design.
- `detectHardBlockFlags()` is regex-based. When adding a flag, add the regex, the test fixture covering both the trigger and a near-miss, and the entry in the docs together — drift breaks the safety net.
- Reputation defaults to 100 when undefined — don't special-case `undefined`, let the default apply.
- Risk scores live in `[0, 1]`. Never let an evaluator return `NaN` or out-of-range — clamp at the source, not the consumer.
- Adding a new guard type: update the schema in `@consensus-tools/schemas`, the dispatcher in `evaluatorVotes()`, and a test fixture together. Three-file change or it's broken.
