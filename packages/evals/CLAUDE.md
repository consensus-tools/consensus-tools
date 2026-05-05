# @consensus-tools/evals

Multi-agent LLM evaluation with reputation-weighted scoring, A/B comparisons, and consensus eval.

## Key Exports

- `evaluateWithAiSdk(input, personas, options)` — LLM-backed evaluation returning `GuardVote[]`
- `consensusEval(versionA, versionB, judges, llmCaller)` — A/B comparison with composite scoring
- `ReputationTracker` — tracks reputation state across evals
- `proposeImprovement()` — select high-rep agent to suggest diffs
- `parseVote()` / `parseABResponse()` — extract structured votes from LLM outputs

## Gotchas

- **Requires LLM API keys** (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) for evaluation.
- Personas are generated per-eval by default — not persisted unless storage is configured.
- Reputation floor is 10 — agents are never fully silenced.

## Code Style

- Optional peer deps (`ai`, `@ai-sdk/anthropic`) load via dynamic `import()`. Wrap in try/catch and rethrow with `{ cause: err }` so missing-deps are diagnosable.
- LLM call failures inside scoring loops log the full error object (not just `.message`) and return `null` — keep the loop alive so one flaky call doesn't poison a batch.
- Reputation never drops below the floor (10). Don't hard-silence agents; let weight-based scoring naturally suppress low-rep voices.
- Personas are generated per-eval by default. If you need persistence, opt in via the `storage` parameter — never silently persist as a side effect.
- Vote parsing (`parseVote`, `parseABResponse`) is regex-based and tolerant. LLM outputs are noisy — return null on parse failure rather than throwing.
