# @consensus-tools/evals

## 0.6.0

### Minor Changes

- You can now run multi-agent A/B evaluations where specialized agents score two document versions and a reputation-weighted composite picks the winner.

  - `consensusEval()` — run N agents, each scoring both versions on clarity/completeness/actionability, then aggregate with reputation weighting
  - `ReputationTracker` — track agent reputation across rounds with ±4 symmetric settlement and pluggable persistence via `ReputationStorage`
  - `validateScore()`, `validateJudgeScore()` — safely parse LLM-generated scores (NaN, strings, out-of-range all default to 2)
  - `weightedComposite()` — standalone utility for reputation-weighted score averaging
  - New types: `JudgeScore`, `AgentEvalScore`, `ConsensusEvalResult`, `ReputationDelta`, `ReputationState`, `ReputationStorage`, `PromptBuilder`
  - 44 tests across 3 test files (validation, reputation, consensus-eval)

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
