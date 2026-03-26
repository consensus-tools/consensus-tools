# @consensus-tools/guards

## 0.8.0

### Patch Changes

- Updated dependencies
  - @consensus-tools/schemas@0.8.0
  - @consensus-tools/storage@0.8.0
  - @consensus-tools/telemetry@0.8.0

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

## 0.5.0

### Minor Changes

- feat: CS guard demo with scroll layout and HITL fixes

  - CS Guard Demo: interactive customer service guard pipeline with scenario generation, agent response drafting, multi-guard consensus, HITL approval, reputation tracking, and real-time SSE telemetry
  - Fix XSS in tier card rendering, HITL approval server-side scenario return, scroll layout, and missing telemetry emission
  - Default guard reputation changed from 1000 to 100
  - Add missing @types/node to packages using Node APIs

### Patch Changes

- Updated dependencies
  - @consensus-tools/schemas@0.5.0

## 0.4.0

### Minor Changes

- 5822686: Initial public release — monorepo restructuring from @consensus-tools/consensus-tools@0.2.0.

### Patch Changes

- Updated dependencies [5822686]
  - @consensus-tools/schemas@0.4.0
