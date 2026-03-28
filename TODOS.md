# Tech Debt & Future Work

## Priority Order (updated 2026-03-28)

```
P1: T7  (Guard Playground — blocker resolved, high demo/DX value)
P2: T4  (Tests for integrations + notifications — 0 coverage on shipped packages)
P3: T1, T2 (decompose 1000+ line files — refactor when next touched)
P4: T8  (Decision Diff — depends on T7)
P5: T3, T12 (SqliteStorage + idempotency — needs IStorage v2, caps work for now)
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

## T7: Guard Playground

**What:** Interactive guard runner with colored vote breakdown and weight tweaking. `pnpm guard:playground --domain code-merge --input examples/sample-pr.json`.

**Why:** Makes guard decisions explorable for debugging and demos. Currently there's no interactive way to see how guards evaluate input.

**Pros:** Quick to build (~30 min), reuses unified GuardHandler, valuable for demos and development.

**Cons:** Low priority — developers can invoke guards programmatically.

**Context:** GuardHandler is unified (shipped v0.8.0). Should display vote breakdown, risk scores, and allow tweaking persona weights to see how decisions change. With LLM personas (v0.9.0), this becomes a powerful way to demo the full deliberation pipeline.

**Depends on:** ~~Guard unification~~ (done).

---

## T8: Decision Diff

**What:** Replay past guard decisions with different persona weights. `pnpm guard:diff --domain publish --input blog.json --weights '...'`.

**Why:** Makes the consensus system tangible and explorable. Shows how weight changes affect outcomes.

**Pros:** Powerful debugging tool for tuning guard policies.

**Cons:** Medium effort. Requires stored decision history and a replay mechanism.

**Context:** Builds on T7 (Guard Playground). Needs access to historical guard results from storage.

**Depends on:** T7 (Guard Playground) + stored decision history.

---

## ~~T9: Cross-Guard Audit View~~ DONE (2026-03-25)

Shipped `summarizeGuardActivity()` + `formatSummaryTable()` in `@consensus-tools/core`. Correlates guardResults with audit events for timestamps. Filterable by time, domain, decision. Exposed via MCP tool (`audit.summary`) and CLI command (`consensus-tools audit`). 10 tests covering filters, limits, edge cases, and table formatting.

---

## T12: Idempotency Race Condition Fix

**What:** Fix race condition where two concurrent guard calls with same input can both create artifacts. Add atomic check-and-set to storage for idempotency keys.

**Why:** Prevents duplicate decisions under concurrent load. Currently documented as a known limitation in GuardHandler.

**Pros:** Correct idempotency guarantees.

**Cons:** Requires SqliteStorage (T3) or optimistic locking. Medium effort.

**Context:** The GuardHandler uses in-memory cache + storage lookup for idempotency. Two concurrent calls can both pass the check before either writes. Real fix requires atomic upsert in storage.

**Depends on:** T3 (SqliteStorage redesign) or storage interface change.

---

## T18: Evaluate util.styleText as chalk replacement for CLI

**What:** Node 20.12+ ships `util.styleText()` for terminal colors. Evaluate whether it can replace chalk in the CLI package, eliminating ~8 transitive dependencies.

**Why:** chalk is the only external runtime dependency (besides commander/zod) in the CLI package. If `util.styleText` covers the needed features (red/green/yellow text, auto-detection of TTY), it reduces the published package's install footprint.

**Pros:** Zero new deps, smaller install, one less thing to audit.

**Cons:** `util.styleText` is newer and less battle-tested. May lack chalk features like nested styles or hex colors (though playground doesn't need those).

**Context:** The Guard Playground (T7) adds chalk for colored vote tables. If `util.styleText` is sufficient, the playground could use it instead. Can also be applied retroactively after T7 ships.

**Depends on:** Nothing. Independent evaluation.

---

## ~~T16: Extract shared LLM client factory~~ DONE (2026-03-21)

Extracted `createLlmFn()` into `packages/core/src/llm-factory.ts`. Single source of truth for model names, max_tokens, and Anthropic/OpenAI selection. Both MCP board-tools and CLI commands now import from core.

---

## ~~T17: Type-safe CLI config for local storage path~~ DONE (2026-03-21)

Added `storagePath?: string` to `ConsensusCliConfig.boards.local` and the Zod schema. Removed the `(cfg as any)` cast in CLI commands.ts.
