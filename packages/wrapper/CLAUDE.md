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

## Code Style

- `block: true` on any `ReviewResult` is an immediate hard-block, regardless of strategy. Use it sparingly — strategy should usually decide. Reserve `block` for unrecoverable issues (PII leak, policy violation).
- `afterResolve` fires for all outcomes — branch on `result.action`, never assume success. Lifecycle hooks are observers, not handlers.
- No built-in reviewers — keep the package small and focused. Callers compose `ReviewerFn[]` from their own code or other packages.
- Retry loop is bounded by `maxRetries`. Never add unbounded retry. If you need backoff, build it into the reviewer, not into the wrapper.
- Hooks (`beforeSubmit`, `afterResolve`, `onBlock`, `onEscalate`) must not throw. Wrap user callbacks in try/catch and log failures — a broken hook must not break the wrapped function.
- Score aggregation strategies (`unanimous`/`majority`/`threshold`) live in `aggregateScores()`. Don't inline the math at call sites — keep the strategy pluggable.
