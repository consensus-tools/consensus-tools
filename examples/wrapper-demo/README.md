# Wrapper Demo — LLM Output Safety Gate

Demonstrates using `createGuardTemplate()` + `createWrapperTemplate()` to gate
an LLM response function with consensus-based safety review.

## What it shows

1. **Guard template** as a reviewer — `safetyGuard.asReviewer()` converts guard
   evaluator rules into a wrapper-compatible reviewer function
2. **Simple score function** as a reviewer — just returns `{ score, rationale }`
3. **Wrapper template** combining both into a unanimous-vote gate
4. **Lifecycle hooks** for logging decisions

## Run

```bash
cd examples/wrapper-demo
bun run demo
```

## Architecture

```
simulateLLM(prompt)
    │
    ▼
createWrapperTemplate("safe_llm_response")
    │
    ├── safetyGuard.asReviewer()     ← Guard template (PII, profanity, hard-block)
    │   └── createGuardTemplate("content_safety")
    │
    ├── relevanceReviewer()           ← Simple score function
    │
    └── Strategy: unanimous, threshold 0.5
        │
        ▼
    Decision: allow / block / escalate
```
