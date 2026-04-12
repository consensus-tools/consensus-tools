# @consensus-tools/core

## 0.8.0

### Minor Changes

- ## Audit & Observability

  ### Added

  - **AI-Powered Audit Explainer (T14):** `explainDecision()` converts raw guard/wrapper decision data into human-readable narratives via LLM. Exposed as MCP tool (`audit.explain`), CLI command (`consensus-tools explain <auditId>`), and library function. Supports Anthropic and OpenAI providers via callback injection — zero SDK coupling in core.
  - **Cross-Guard Audit View (T9):** `summarizeGuardActivity()` provides aggregate view of all guard decisions. Filterable by time range, guard domain, and decision type. Exposed as MCP tool (`audit.summary`), CLI command (`consensus-tools audit`), and library function. Includes formatted table output for CLI.
  - **Explain types:** `ExplainInput`, `ExplainResult`, `NormalizedVote` schemas for structured audit explanation data.
  - **Shared LLM factory (T16):** `createLlmFn()` in core — single source of truth for Anthropic/OpenAI client construction.

  ### Changed

  - **CLI config (T17):** Added typed `storagePath` field to `ConsensusCliConfig.boards.local`, removing unsafe `as any` cast.
  - **LLM SDK dependencies:** Moved `@anthropic-ai/sdk` and `openai` from runtime to dev dependencies in MCP and CLI packages (dynamically imported at runtime only when user has them installed).

### Patch Changes

- Updated dependencies
  - @consensus-tools/schemas@0.8.0
  - @consensus-tools/guards@0.8.0
  - @consensus-tools/storage@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies
  - @consensus-tools/guards@0.7.0

## 0.5.0

### Minor Changes

- feat: CS guard demo with scroll layout and HITL fixes

  - CS Guard Demo: interactive customer service guard pipeline with scenario generation, agent response drafting, multi-guard consensus, HITL approval, reputation tracking, and real-time SSE telemetry
  - Fix XSS in tier card rendering, HITL approval server-side scenario return, scroll layout, and missing telemetry emission
  - Default guard reputation changed from 1000 to 100
  - Add missing @types/node to packages using Node APIs

### Patch Changes

- Updated dependencies
  - @consensus-tools/guards@0.5.0
  - @consensus-tools/schemas@0.5.0

## 0.4.0

### Minor Changes

- 5822686: Initial public release — monorepo restructuring from @consensus-tools/toolkit@0.2.0.

### Patch Changes

- Updated dependencies [5822686]
  - @consensus-tools/schemas@0.4.0
  - @consensus-tools/guards@0.4.0
