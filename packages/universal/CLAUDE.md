# @consensus-tools/universal

Single-line governance facade for autonomous agents. Two modes:

1. **Regex mode** (default): Deterministic pattern-matching guards. No LLM, sub-millisecond.
2. **LLM persona mode** (when `config.model` provided): Multi-model deliberation with reputation tracking.

## Key Exports

- `consensus.wrap(wrappable, config?)` — wrap function/executor with governance
- `consensus.langchain(_, config?)` — returns a `ConsensusGuardCallbackHandler` for LangChain (dynamically loads @consensus-tools/langchain; chain argument is unused, attach the handler to your chain's callbacks)
- `consensus.aiSdk(fn, config?)` — Vercel AI SDK adapter (dynamically loads @consensus-tools/ai-sdk)
- `consensus.mcp(config?)` — MCP adapter (dynamically loads @consensus-tools/mcp)
- Error types: `ConsensusBlockedError`, `MissingDependencyError`, `ConfigError`

## Architecture

- `Wrappable` resolution: tries `.execute` → `.invoke` → `.call` → assume function
- Regex mode creates 3 default reviewers from `GUARD_CONFIGS`
- LLM mode uses `deliberate()` with `ReputationManager` per persona
- Adapter packages are optional peer deps, dynamically loaded on first use

## Gotchas

- **Two completely different code paths** for regex vs LLM mode — different retry/escalation logic.
- LLM mode bypasses the wrapper package — `createLlmExecutor()` calls `deliberate()` directly.
- `shadow` mode never blocks — logs decisions but always executes.
- `failPolicy: "open"` executes even on governance failure; `"closed"` throws `ConsensusBlockedError`.
- Production warnings logged if `failPolicy="open"` or `storage="memory"`.
