# @consensus-tools/wrapper

Consensus gate wrapper for any async function. Multiple reviewers score output independently, then a strategy (unanimous/majority/threshold) decides allow/block/retry/escalate.

## Key Exports

- `consensus(options)` — wrap a function with consensus gate, returns async function
- `aggregateScores()` — combine reviewer scores by strategy
- Types: `ReviewerFn<T>`, `ReviewResult`, `DecisionResult<T>`, `LifecycleHooks`

## Architecture

- Retry loop: call fn → collect scores → apply strategy → allow/block/retry/escalate
- Strategies: `unanimous`, `majority`, `threshold`
- Hooks: `beforeSubmit`, `afterResolve`, `onBlock`, `onEscalate`

## Gotchas

- `block: true` on any `ReviewResult` forces immediate block, overriding strategy.
- `maxRetries` default is 1 (meaning 2 total attempts).
- `afterResolve` fires for all outcomes — check `result.action` to distinguish.
- No built-in reviewers — caller must provide `ReviewerFn[]`.
