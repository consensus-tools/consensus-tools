# @consensus-tools/universal

## 0.11.1

### Patch Changes

- Updated dependencies [90e0855]
  - @consensus-tools/mcp@0.11.1
  - @consensus-tools/schemas@0.11.1
  - @consensus-tools/guards@0.11.1
  - @consensus-tools/core@0.11.1
  - @consensus-tools/ai-sdk@0.11.1
  - @consensus-tools/langchain@0.11.1
  - @consensus-tools/personas@0.11.1
  - @consensus-tools/policies@0.11.1
  - @consensus-tools/storage@0.11.1

## 0.11.0

### Minor Changes

- Unify regex and LLM modes onto a single pre-execution gating pipeline (pre-1.0, no major bump):
  - The wrapped function now runs at most once per call — fixes double-execution under regex `failPolicy: "open"` (a real bug for side-effecting tools: emails sent twice, payments charged twice).
  - Regex mode now gates execution **before** running the function (matching LLM mode), instead of executing then reviewing output.
  - `DEFAULTS.guards` is now `["security", "compliance", "user-impact"]` (the active persona trio) instead of the no-op `["agent_action"]`.
  - Hard-block veto restored: any single guard vote that is NO with risk ≥ 0.8 (or matches a `hardBlockPattern`) forces `action: "block"` regardless of policy.
  - Shadow mode never blocks, even on deliberation crashes.
  - `consensus.wrap()` throws `ConfigError` if `guards` is empty in regex mode; warns when `personas` is provided without a `model` (ignored in regex mode).
  - `onDecision` always receives `LlmDecisionResult`; `consensus.wrap()` always returns `AugmentedExecutor` (with `.feedback()`).
  - `LlmDecisionResult.votes[]` adds an optional `block?: boolean` field used by the hard-block veto.
  - `createLogger` now returns a `LoggerEmitter` (`{start, result, respawn}`) instead of `LifecycleHooks`.
  - **Removed:** `policyToStrategy()` export and the dependency on `@consensus-tools/wrapper` (the wrapper package still exists for genuine post-hoc output-review use cases).
