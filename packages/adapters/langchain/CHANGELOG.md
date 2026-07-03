# @consensus-tools/langchain

## 0.11.1

### Patch Changes

- Updated dependencies [90e0855]
  - @consensus-tools/schemas@0.11.1
  - @consensus-tools/guards@0.11.1

## 0.8.0

### Patch Changes

- Updated dependencies
  - @consensus-tools/schemas@0.8.0
  - @consensus-tools/guards@0.8.0

## 0.7.0

### Minor Changes

- ## New packages

  - **@consensus-tools/personas** — Unified persona lifecycle: types, 3 persona packs (default, skill-review, governance), reputation engine (deterministic vote-alignment math), respawn logic (learning + mutation).
  - **@consensus-tools/langchain** — LangChain adapter: guards as DynamicStructuredTools, ConsensusCallbackHandler for audit, LangSmithTracer for decision tracing.
  - **@consensus-tools/ai-sdk** — Vercel AI SDK adapter: `createGuardedGenerate()` middleware for generateText, `createGuardedStream()` for streamText.

  ## Template system (new feature across guards, policies, wrapper)

  - **@consensus-tools/guards** — `createGuardTemplate()` for custom guard domains with `.asReviewer()` bridge to wrapper and `.register()` for registry.
  - **@consensus-tools/policies** — `createPolicyTemplate()` to extend any of 9 base consensus algorithms with overrides and pre-checks.
  - **@consensus-tools/wrapper** — `createWrapperTemplate()` for reusable consensus-gated functions combining reviewers + strategy + hooks.

  ## Other changes

  - **@consensus-tools/evals** — Personas re-imported from @consensus-tools/personas (AgentPersona = EvalPersonaConfig, backwards compatible).

### Patch Changes

- Updated dependencies
  - @consensus-tools/guards@0.7.0
