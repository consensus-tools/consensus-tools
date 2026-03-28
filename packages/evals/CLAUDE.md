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
