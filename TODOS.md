# Tech Debt & Future Work

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
