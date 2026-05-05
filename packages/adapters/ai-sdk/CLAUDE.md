# @consensus-tools/ai-sdk

Vercel AI SDK adapter. Middleware wrapper for `generateText`/`streamText` that enforces consensus guards on LLM outputs.

## Key Exports

- `createGuardedGenerate(options)` / `createGuardedStream(options)` — wrap AI SDK calls with guard evaluation
- Decision outcomes: allow, block, rewrite, escalate

## Gotchas

- Peer dependency on `ai` SDK (>= 4.0.0) — must be installed separately.

## Code Style

- Middleware composes around the AI SDK call — never replace it. Always pass the original `result` through on the `allow` path.
- On `block` or `escalate`, return a structured outcome with the original LLM output attached so callers can decide what to surface to users. Don't throw — middleware should produce decisions, not exceptions.
- Streaming wrappers must drain the original stream. Never abort early without flushing buffered tokens, or the upstream model gets billed for nothing.
- Type the wrapped function via the AI SDK's published types — don't redeclare `generateText` shape locally. Drift breaks consumers on SDK upgrades.
