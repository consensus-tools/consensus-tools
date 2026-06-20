---
"@consensus-tools/evals": minor
"@consensus-tools/core": patch
---

**evals: `evaluateWithAiSdk` is now Anthropic-first.** It defaults to `claude-opus-4-8` via `@ai-sdk/anthropic` (previously OpenAI `gpt-4o-mini` via `@ai-sdk/openai`), matching the toolkit's "default to the latest Claude model" guidance and `core`'s `createLlmFn`. New: an explicit `provider?: "anthropic" | "openai"` field on `AiEvaluatorConfig`, `DEFAULT_ANTHROPIC_MODEL`/`DEFAULT_OPENAI_MODEL` exports, and `parseAiResponse` is now exported. OpenAI is still used when `provider: "openai"` is passed or when only `OPENAI_API_KEY` is set. `config.apiKey` with no `provider` is treated as the Anthropic key.

**core: retired-model fix.** `createLlmFn`'s Anthropic default moved off `claude-sonnet-4-20250514` (deprecated, scheduled for retirement) to `claude-sonnet-4-6`.
