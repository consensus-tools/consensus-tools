# @consensus-tools/universal

Single-line governance facade for autonomous agents. **Pre-execution gating**: the wrapped function only runs when consensus allows it. Two voting modes share a single pipeline:

1. **Regex mode** (default): synthetic personas (one per configured guard) vote via deterministic regex evaluation. Sub-millisecond, no LLM.
2. **LLM persona mode** (when `config.model` provided): personas vote via parallel LLM calls with regex fallback on failure.

## Key Exports

- `consensus.wrap(wrappable, config?)` — wrap function/executor with governance. Returns `AugmentedExecutor` with `.feedback()` for reputation updates.
- `consensus.langchain(_, config?)` — returns a `ConsensusGuardCallbackHandler` for LangChain (dynamically loads @consensus-tools/langchain; chain argument is unused, attach the handler to your chain's callbacks)
- `consensus.aiSdk(fn, config?)` — Vercel AI SDK adapter (dynamically loads @consensus-tools/ai-sdk)
- `consensus.mcp(config?)` — MCP adapter (dynamically loads @consensus-tools/mcp)
- Error types: `ConsensusBlockedError`, `MissingDependencyError`, `ConfigError`

## Architecture

- `Wrappable` resolution: tries `.execute` → `.invoke` → `.call` → assume function
- **Single deliberation pipeline** routes through `deliberate()` regardless of mode:
  1. Regex pre-screen (always runs)
  2. Risk-tier fast-path (low-tier tools skip the full vote)
  3. Vote collection — branches on `config.model`: parallel LLM calls vs per-persona regex evaluation
  4. `resolveConsensus()` aggregates into a single allow/block/escalate decision
  5. `fn()` runs only on allow (or in shadow mode, or under `failPolicy:"open"` on block)
- Adapter packages (langchain/ai-sdk/mcp) are optional peer deps, dynamically loaded on first use
- Audit entries written via `IStorage.update()` after every decision

## Gotchas

- `shadow` mode never blocks — logs decisions but always executes `fn()`.
- `failPolicy: "open"` executes `fn()` once on block or deliberation error. `"closed"` throws `ConsensusBlockedError`.
- Production warnings logged if `failPolicy="open"` or `storage="memory"`.
- In LLM mode, regex pre-screen signals are passed into the persona prompt as context — personas can still vote against pre-screen findings.
- Per-persona LLM call timeout defaults to 3000ms. Slow models will hit fallback votes silently — wire a logger to see the `regex_fallback` source.

## Code Style

- Translate optional-import failures into `MissingDependencyError(name, { cause: error })`. Always preserve the cause so debug builds see why the import failed (network? permissions? wrong version?).
- Optional adapters load via dynamic `import()` so consumers don't pay for unused integrations. Don't statically import adapter packages here.
- **One pipeline, one shape.** Both modes route through `deliberate()` and produce `LlmDecisionResult`. Don't reintroduce a parallel regex-only path — the divergence was a real source of bugs (including double-execution on block + open).
- `fn()` MUST run at most once per call. The pre-execution model means: never call `fn()` to "review the output," only to perform the action after consensus allows it.
- Lifecycle/decision events go through the configured logger emitter, not raw `console.*`. The logger is part of the public API. **Exception:** the production-config warnings (`failPolicy="open"`, `storage="memory"`) fire at `wrap()` construction time before the logger emitter is built — they use `console.warn` by necessity.
- `failPolicy: "open"` is an explicit choice with risk — log a warning at construction time, never silently default to permissive.
- Respawn handlers only fire in LLM mode — regex personas are deterministic and have nothing to mutate.
