# Tech Debt & Future Work

## Priority Order (updated 2026-03-20)

```
P0: T11 (Unify Personas) → T10 (/consensus-engineer)
P2: T13 (GitHub auth), T7 (Guard Playground), T9 (Audit View)
P3: T1, T2, T5, T6 (tech debt + demo tooling)
P4: T3, T4, T8, T12 (deferred / blocked)
```

---

## T1: Decompose sdk-node/server.ts into route modules

**What:** Split the 1014-line HTTP server into per-domain route files (jobs-routes.ts, guard-routes.ts, workflows-routes.ts, etc.).

**Why:** Violates the "sharp boundaries" design principle. The `handle()` method is a massive if/else chain on URL paths, making it hard to navigate and review.

**Pros:** Easier to maintain, test individual route groups, and onboard contributors.

**Cons:** Large diff with no behavioral change; risk of routing regressions.

**Context:** Server currently works with 30 passing tests. Webhook handlers are already extracted into `handlers/`. Trigger this when the server next needs significant route additions.

**Depends on:** Nothing.

---

## T2: Decompose workflows/node-executor.ts into per-node-type executors

**What:** Split the 1038-line NodeExecutor into per-node-type files (trigger-executor.ts, agent-executor.ts, guard-executor.ts, hitl-executor.ts, action-executor.ts, group-executor.ts).

**Why:** Same "sharp boundaries" concern as the server. Each node type has distinct dependencies and logic.

**Pros:** Easier to test individual node types, clearer dependency boundaries.

**Cons:** Large diff, no behavioral change. The NodeExecutor is only called by WorkflowRunner, so blast radius is contained.

**Context:** The main `execute()` switch statement dispatches to private methods. Extraction is straightforward.

**Depends on:** Nothing.

---

## T3: Redesign SqliteStorage to use proper per-entity tables

**What:** Replace the single KV-blob approach (`INSERT INTO kv (key, value)`) with a table per entity type (jobs, ledger, audit, etc.).

**Why:** Current design serializes ALL state as a single JSON blob on every write. With configurable caps (added in this PR) this is manageable short-term, but proper SQL would unlock queries, indexing, and pagination.

**Pros:** O(1) reads/writes per entity, SQL queries, pagination support, proper indexing.

**Cons:** Breaks or requires evolving the `IStorage` interface, large migration effort, needs schema versioning.

**Context:** The `IStorage.update()` contract assumes a single state blob — this is the fundamental constraint. A new `ISqlStorage` interface or a v2 of `IStorage` would be needed.

**Depends on:** Configurable caps (shipped in this PR) serve as the short-term fix.

---

## T4: Add tests for integrations and notifications packages

**What:** Unit tests with mocked external dependencies (GitHub CLI, Slack/Discord/Teams/Telegram APIs).

**Why:** Two packages with zero test coverage.

**Pros:** Catches regressions in adapter-layer code.

**Cons:** Requires extensive mocking of external services; these are thin wrappers so ROI is lower than core tests.

**Context:** The notifications package has 5 chat adapters (Slack, Teams, Discord, Telegram, webhook) with no test coverage. The integrations package wraps GitHub CLI and Linear API. **Evals package now has 44 tests (validation, reputation, consensus-eval) — completed in v0.6.0.**

**Depends on:** Nothing, but testing evals should happen after the `allowDeterministicFallback` change (shipped in this PR).

---

## T5: Skill guard demo — audit log export command

**What:** Add `tsx main.ts --export-audit` flag to skill-guard-demo that pretty-prints the ndjson audit trail for debugging.

**Why:** After a confusing demo run, the raw `.data/skill-guard-audit.ndjson` file has all the data but is hard to scan. A formatted view showing rounds → proposals → votes → decisions → settlements would make debugging trivial.

**Pros:** Quick to build (~30 lines), reuses existing audit data, valuable for demo presentations.

**Cons:** Low priority — users can `cat audit.ndjson | jq` for now.

**Context:** The ndjson audit log was added as part of the skill-guard-demo implementation. Each line is a JSON object with `ts`, `event`, and event-specific fields. Events: `demo.start`, `proposal`, `guard.decision`, `guard.rewrite`, `judge`, `settlement`, `skill.written`, `demo.complete`.

**Depends on:** Skill guard demo (examples/skill-guard-demo).

---

## T6: Skill guard demo — compare mode for regression testing

**What:** Add `tsx main.ts --compare <baseline.json>` that runs the demo, saves scores, and diffs against a previous baseline.

**Why:** Validates the demo's core thesis: iterative consensus-driven improvement actually works. A regression test would show judge score deltas across runs and flag quality drops.

**Pros:** Makes the demo self-validating. Uses existing audit log data. Natural follow-up to the eval patterns in consensus-gstack-evals.

**Cons:** Medium effort — needs baseline file format, score extraction from audit log, diff rendering.

**Context:** The demo already shows score progression per skill in the final summary. This TODO would formalize that into a saveable/comparable format. The gstack-evals repo has a similar pattern: `test/fixtures/eval-baselines.json` pinning LLM judge scores.

**Depends on:** T5 (audit log export) for the data format, though could also read directly from ndjson.

---

## T7: Guard Playground

**What:** Interactive guard runner with colored vote breakdown and weight tweaking. `pnpm guard:playground --domain code-merge --input examples/sample-pr.json`.

**Why:** Makes guard decisions explorable for debugging and demos. Currently there's no interactive way to see how guards evaluate input.

**Pros:** Quick to build (~30 min), reuses unified GuardHandler, valuable for demos and development.

**Cons:** Low priority — developers can invoke guards programmatically.

**Context:** Depends on guard unification (unified GuardHandler). Should display vote breakdown, risk scores, and allow tweaking persona weights to see how decisions change.

**Depends on:** Guard unification.

---

## T8: Decision Diff

**What:** Replay past guard decisions with different persona weights. `pnpm guard:diff --domain publish --input blog.json --weights '...'`.

**Why:** Makes the consensus system tangible and explorable. Shows how weight changes affect outcomes.

**Pros:** Powerful debugging tool for tuning guard policies.

**Cons:** Medium effort. Requires stored decision history and a replay mechanism.

**Context:** Builds on T7 (Guard Playground). Needs access to historical guard results from storage.

**Depends on:** T7 (Guard Playground) + stored decision history.

---

## T9: Cross-Guard Audit View

**What:** Aggregate view of all guard decisions across domains. `pnpm guard:audit --last 24h` renders a summary table: domain, timestamp, decision, vote split, persona set.

**Why:** First-ever aggregate view of consensus activity. Currently decisions are only visible per-guard.

**Pros:** Quick to build (~30 min), uses existing board read APIs.

**Cons:** Low priority — `jq` on board artifacts gets 80% of the way there.

**Context:** Depends on @consensus-tools/storage being queryable. Uses guardResults from StorageState.

**Depends on:** Storage package extraction.

---

## ~~T10: /consensus-engineer Skill~~ DONE (2026-03-20, Phase 1)

Phase 1 shipped: llms.txt (2139-line system reference) + SKILL.md (359-line interactive 6-phase guide) + gen:llms validation script. Lives in `skills/consensus-engineer/`. Phase 2 (demo scaffolding, guard domain creation, schema generation) and Phase 3 (LangChain, LangSmith, Docker, AI SDK adapters) tracked as future work.

---

## ~~T11: Unify Persona Packages~~ DONE (2026-03-20)

Merged consensus-persona-engine + consensus-persona-generator + consensus-persona-respawn into `@consensus-tools/personas`. Standalone packages deleted. 28 tests, Tier 1 placement, evals re-imports from personas.

---

## T12: Idempotency Race Condition Fix

**What:** Fix race condition where two concurrent guard calls with same input can both create artifacts. Add atomic check-and-set to storage for idempotency keys.

**Why:** Prevents duplicate decisions under concurrent load. Currently documented as a known limitation in GuardHandler.

**Pros:** Correct idempotency guarantees.

**Cons:** Requires SqliteStorage (T3) or optimistic locking. Medium effort.

**Context:** The GuardHandler uses in-memory cache + storage lookup for idempotency. Two concurrent calls can both pass the check before either writes. Real fix requires atomic upsert in storage.

**Depends on:** T3 (SqliteStorage redesign) or storage interface change.

---

## T13: Skill version eval — GitHub API authentication

**What:** Add optional `GITHUB_TOKEN` env var to the skill-version-eval server for authenticated GitHub API access.

**Why:** Unauthenticated GitHub API rate limit is 60 requests/hour per IP. For a deployed multi-user tool, this is ~20 evals/hour shared across all users. Authenticated access provides 5,000 req/hr.

**Pros:** Unlocks public deployment at scale without users hitting rate limits.

**Cons:** Requires managing a GitHub token. Minimal implementation effort (~30 min).

**Context:** The server proxies GitHub API calls via `/api/commits` and `/api/content` routes in `consensus-tools/examples/skill-version-eval/src/fetcher.ts`. The `githubFetch()` function already builds headers — adding an `Authorization: Bearer ${token}` header when `GITHUB_TOKEN` env var is set is the only change needed.

**Depends on:** Nothing.

---

## T14: AI-Powered Audit Explainer

**What:** A tool that reads any decision audit trail (GuardResult, DecisionResult, or raw vote data) and produces human-readable reasoning explaining how the policy ran — which reviewers voted what, how weights and reputation applied, why the final decision was reached.

**Why:** Guard and wrapper decisions produce structured data (GuardVote[], ReviewResult[], risk scores, weights, policy config) that's machine-readable but opaque to humans. A compliance officer reviewing an audit trail shouldn't need to understand vote aggregation math — they need: "3 of 5 reviewers flagged this as high-risk because the loan amount exceeded $100K. The Security Gatekeeper (reputation: 0.85) voted NO with 0.92 confidence, citing missing fraud verification. The weighted consensus policy required 70% approval but only achieved 40%, resulting in BLOCK."

**Pros:** Makes audit trails useful for compliance, debugging, and stakeholder communication. Works across ALL interfaces — GuardVote (guards), ReviewResult (wrapper), and MCP tool responses. Transforms raw decision data into narrative explanations.

**Cons:** Requires an LLM call per explanation (cost). Need to design the prompt carefully to only reference data present in the audit record. Medium effort.

**Context:** The audit data already exists in storage. GuardResult has votes[], decision, risk_score, audit_id. DecisionResult has scores[], action, aggregateScore. Both share the same underlying primitives (evaluator/reviewer assessments + aggregation policy). The explainer reads structured data + policy config (quorum, riskThreshold, strategy) and generates a narrative. Expose as: (1) MCP tool `audit.explain`, (2) function `explainDecision(result, policy)`, (3) CLI `consensus-tools explain <audit_id>`. Should accept any vote format — GuardVote, ReviewResult, or the raw weighted votes from consensus resolution.

**Effort estimate:** M

**Priority:** P2

**Depends on:** Nothing — audit data already exists in storage.

---

## T15: Migrate Bun examples to vitest + tsx

**What:** Convert skill-version-eval, skill-sandbox, and wrapper-demo from Bun runtime to vitest + tsx, matching the monorepo standard (pnpm + Turbo + vitest).

**Why:** These 3 examples use `bun test` / `bun run` but CI doesn't have Bun. Currently their test scripts are `echo` skips, meaning CI never runs their tests. Migrating to vitest means Turbo runs them natively and CI catches regressions.

**Pros:** CI actually tests these examples. Consistent tooling across the entire monorepo. No more Bun requirement for contributors.

**Cons:** Small migration effort. `bun:test` → `vitest` requires changing imports (`import { describe, test, expect, mock } from "bun:test"` → `import { describe, it, expect, vi } from "vitest"`). `bun run` → `tsx` for dev scripts.

**Context:** The core packages, cs-demo, and fintech-demo all use vitest/tsx. Only the 3 skill-related examples broke the pattern because they were created from a Bun-based repo (consensus-gstack-evals). The `globalThis.fetch` mocking pattern in fetcher.test.ts works the same in vitest.

**Effort estimate:** S (~30 min)

**Priority:** P3

**Depends on:** Nothing.
