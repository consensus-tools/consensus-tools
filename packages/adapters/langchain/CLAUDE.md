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

## Code Style

- Tracing must never break the app. Wrap `client.createRun()` in try/catch — but log failures via `console.warn` so they're observable. Silent failure is worse than visible failure.
- Trace input types stay distinct — don't unify `GuardTraceInput` and `WrapperTraceInput` behind a generic. The schemas diverge intentionally.
- Peer deps (`@langchain/core`, `langsmith`) imported normally. They're declared as required peers, so missing-dep errors come from the resolver, not us.
- Callback handlers extend LangChain's base classes — match their lifecycle method names exactly. LangChain dispatches by name.
