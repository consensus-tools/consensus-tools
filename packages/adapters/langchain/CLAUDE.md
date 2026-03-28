# @consensus-tools/langchain

LangChain integration. Exposes consensus guards as LangChain tools with callback handlers and LangSmith tracing.

## Key Exports

- `createGuardTool(guardId)` / `createGuardTools()` — guard as LangChain StructuredTool
- `ConsensusCallbackHandler` — decision lifecycle tracking
- `ConsensusGuardCallbackHandler` — guard policy enforcement (this is what `consensus.langchain()` wires up)
- `LangSmithTracer` — traces guard/wrapper execution

## Gotchas

- Requires peer deps: `@langchain/core` (>= 0.3.0) and `langsmith` (>= 0.4.0).
- Tracer has two input types (`GuardTraceInput`, `WrapperTraceInput`) — different schemas.
