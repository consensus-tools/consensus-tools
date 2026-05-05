---
"@consensus-tools/universal": minor
---

Unify regex and LLM modes onto a single pre-execution gating pipeline.

**Behavior changes (pre-1.0, no major bump):**

- The wrapped function now runs at most once per call. Previously, regex mode with `failPolicy: "open"` could execute the wrapped function twice on a block (once via the wrapper package, again as the open-fallback). For side-effecting tools this was a real bug — emails sent twice, payments charged twice, etc.
- Regex mode now gates execution **before** running the function (matching LLM mode), instead of executing and then reviewing the output.
- `DEFAULTS.guards` is now `["security", "compliance", "user-impact"]` (the active persona trio) instead of `["agent_action"]`. The previous default was a no-op for the unified pipeline because `agent_action` is not a key in `GUARD_CONFIGS`, which would have made the default config a rubber stamp.
- Hard-block veto restored: any single guard vote that is NO with risk ≥ 0.8 (or matches a `hardBlockPattern`) forces `action: "block"` regardless of policy. Preserves the old wrapper semantic where any `block: true` reviewer overrode strategy. Without this, security saying NO at risk 0.9 could be outvoted by two unrelated guards saying YES under `majority`.
- Shadow mode now never blocks even on deliberation crashes (closes a gap where `mode: "shadow"` + LLM failure + `failPolicy: "closed"` would throw).
- `consensus.wrap()` throws `ConfigError` if `guards` is empty in regex mode (no `model` configured).
- `consensus.wrap()` warns when `personas` is provided without a `model` — they are silently ignored in regex mode (which synthesizes personas from `guards`).
- The `onDecision` callback always receives `LlmDecisionResult`. Previously it received `DecisionResult<T>` in regex mode and `LlmDecisionResult` in LLM mode.
- `consensus.wrap()` now always returns `AugmentedExecutor` (with a `.feedback()` method). Previously regex mode returned a plain `ToolExecutor`.
- `LlmDecisionResult.votes[]` adds an optional `block?: boolean` field used by the hard-block veto.
- `createLogger` now returns a `LoggerEmitter` (`{start, result, respawn}`) instead of `LifecycleHooks` (`{beforeSubmit, afterResolve, onBlock, onEscalate}`).

**Removed:**

- `policyToStrategy()` export (no longer used internally; the strategy aggregator is replaced by `resolveConsensus()`).
- Dependency on `@consensus-tools/wrapper` (the package still exists and is still useful for genuine post-hoc output-review use cases — just no longer used by the universal facade).

**Why:** the two pipelines had opposite execution semantics (post-hoc review vs pre-execution gating) hidden behind a single facade. Risk-tier fast-path, shadow mode, and feedback only worked in LLM mode because they only make sense for pre-execution gating. Unifying around pre-execution makes all three available everywhere and eliminates the double-execution bug class.
