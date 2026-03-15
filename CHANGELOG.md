# Changelog

## 0.5.0 — 2026-03-15

### Added
- CS Guard Demo (`examples/cs-demo`): interactive customer service guard pipeline with scenario generation, agent response drafting, multi-guard consensus evaluation, HITL approval via Slack-style dialog, reputation tracking with slash/payout mechanics, and real-time SSE telemetry stream
- Four risk tiers (low/medium/high/critical) with configurable guard count, quorum, and HITL thresholds
- Rewrite loop: guards can request agent response revisions up to 2x before escalating to HITL
- Flag-bad-response flow: slash guards who approved responses later flagged as bad

### Fixed
- Center column scroll layout: sections expand to fit content (min 220px), only center column scrolls while left/right columns stay static
- HITL approval now returns scenario from server instead of fragile DOM scraping with wrong CSS selector
- XSS in tier card rendering replaced inline onclick with event delegation
- Bad Response button and Export button margin/alignment
- Missing `ledger.payout` telemetry emission in HITL APPROVE path

### Changed
- Default guard reputation from 1000 to 100

## 0.3.0 — 2026-03-13

Complete monorepo restructuring from the monolithic `@consensus-tools/consensus-tools@0.2.0` into 16 focused packages across 5 tiers.

See [MIGRATION.md](./MIGRATION.md) for upgrade details.

### Added
- 16-package pnpm monorepo with tiered dependency architecture (schemas → guards → core → workflows → adapters)
- Dependency enforcement via dependency-cruiser (`pnpm dep-check`) and LLM SDK ban (`check-deps.mjs`)
- 9 consensus policies: FIRST_SUBMISSION_WINS, HIGHEST_CONFIDENCE_SINGLE, APPROVAL_VOTE, OWNER_PICK, TRUSTED_ARBITER, TOP_K_SPLIT, MAJORITY_VOTE, WEIGHTED_VOTE_SIMPLE, WEIGHTED_REPUTATION
- 7 guard types with three-step weighted decision model (risk threshold → quorum → final verdict)
- DAG-based workflow engine with checkpoint/cursor persistence and HITL pause/resume
- MCP server with 29 tools exposing the full consensus protocol to LLM agents
- Node.js HTTP server (sdk-node) with REST API, webhooks, guard evaluation, and workflow execution
- Human-in-the-loop tracker with timeout, warning, and auto-decision on expiry
- Notification dispatch via Slack, Teams, Discord, Telegram, and webhook fallback
- AES-256-GCM credential encryption (secrets package)
- React + Vite dashboard with workflow builder, audit timeline, and agent management
- CLI for managing jobs, agents, and traces
- Pluggable policy registry (`createPolicyRegistry`, `createRegistryResolver`)
- Configurable storage caps (maxAuditEntries, maxLedgerEntries, maxGuardResults)
- Input validation schemas for participants and consensus votes
- Zod schemas for all protocol types (schemas package)
- Changeset-based npm publishing infrastructure
- 433 tests across 12 packages

### Changed
- Removed deprecated Job field aliases (`desc`, `rewardAmount`, `stakeAmount`) — use `description`, `reward`, `stakeRequired`
- Policy resolution is now canonical in `@consensus-tools/core`; `@consensus-tools/policies` re-exports + adds registry
- `evaluateWithAiSdk` now throws by default when no API key is configured (pass `allowDeterministicFallback: true` to opt in)
- `listJobs`, `getJob`, `getStatus` now use `storage.update()` for atomic expiry checks
- HITL deadline checker re-verifies pending status inside storage callbacks before sending notifications
- Reputation scores pre-computed in single pass (O(L) instead of O(V×L))
- Board listing uses single-pass aggregation instead of O(boards × audit) nested scan

### Fixed
- Timing-safe auth token comparison (prevents timing attacks)
- Timing-safe Telegram webhook secret and agent API key comparisons
- Consensus vote aggregation moved inside storage.update() to eliminate TOCTOU race
- NodeExecutor throws on unknown node types instead of silently passing
- Payload-too-large errors now return HTTP 413 (was 500)
- O(n²) buffer re-concatenation in request body reader
- Removed 7 duplicated policy implementation files (300+ lines of dead code)

### Removed
- Monolithic `index.ts` + `src/` directory structure
- `security-policy.json` and associated CI workflow
- `openclaw.plugin.json` (moved to `@consensus-tools/openclaw`)
