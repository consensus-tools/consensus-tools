# @consensus-tools/ai-sdk

Vercel AI SDK adapter. Middleware wrapper for `generateText`/`streamText` that enforces consensus guards on LLM outputs.

## Key Exports

- `createGuardedGenerate(options)` / `createGuardedStream(options)` — wrap AI SDK calls with guard evaluation
- Decision outcomes: allow, block, rewrite, escalate

## Gotchas

- Peer dependency on `ai` SDK (>= 4.0.0) — must be installed separately.
