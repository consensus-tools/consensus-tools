# @consensus-tools/mcp

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
  - @consensus-tools/core@0.8.0
  - @consensus-tools/schemas@0.8.0
  - @consensus-tools/policies@0.8.0
  - @consensus-tools/workflows@0.8.0
  - @consensus-tools/wrapper@0.8.0
  - @consensus-tools/guards@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies
  - @consensus-tools/guards@0.7.0
  - @consensus-tools/policies@0.7.0
  - @consensus-tools/wrapper@0.7.0
  - @consensus-tools/core@0.7.0
  - @consensus-tools/workflows@0.7.0

## 0.6.0

### Patch Changes

- @consensus-tools/workflows@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies
  - @consensus-tools/core@0.5.0
  - @consensus-tools/guards@0.5.0
  - @consensus-tools/policies@0.5.0
  - @consensus-tools/schemas@0.5.0
  - @consensus-tools/workflows@0.5.0
  - @consensus-tools/wrapper@0.5.0

## 0.4.0

### Minor Changes

- 5822686: Initial public release — monorepo restructuring from @consensus-tools/consensus-tools@0.2.0.

### Patch Changes

- Updated dependencies [5822686]
  - @consensus-tools/schemas@0.4.0
  - @consensus-tools/core@0.4.0
  - @consensus-tools/guards@0.4.0
  - @consensus-tools/policies@0.4.0
  - @consensus-tools/workflows@0.4.0
  - @consensus-tools/wrapper@0.4.0
