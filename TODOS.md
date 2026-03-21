# Tech Debt & Future Work

## Priority Order (updated 2026-03-20)

```
P2: T7 (Guard Playground), T9 (Audit View)
P3: T1, T2 (tech debt), T16 (LLM factory DRY), T17 (CLI config cast)
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

## T12: Idempotency Race Condition Fix

**What:** Fix race condition where two concurrent guard calls with same input can both create artifacts. Add atomic check-and-set to storage for idempotency keys.

**Why:** Prevents duplicate decisions under concurrent load. Currently documented as a known limitation in GuardHandler.

**Pros:** Correct idempotency guarantees.

**Cons:** Requires SqliteStorage (T3) or optimistic locking. Medium effort.

**Context:** The GuardHandler uses in-memory cache + storage lookup for idempotency. Two concurrent calls can both pass the check before either writes. Real fix requires atomic upsert in storage.

**Depends on:** T3 (SqliteStorage redesign) or storage interface change.

---

## T16: Extract shared LLM client factory

**What:** The `createLlmFn` pattern (Anthropic vs OpenAI selection, model name, max_tokens) is duplicated in `packages/adapters/mcp/src/tools/board-tools.ts` and `packages/cli/src/commands.ts`. Extract into a shared utility.

**Why:** DRY — model strings (`claude-sonnet-4-20250514`, `gpt-4o-mini`) and `max_tokens: 1024` appear in both files. When we update the default model, both need changing.

**Pros:** Single place to update model defaults. Enables future configurability (e.g., user-selected model via config).

**Cons:** Adds a new file. Only 2 call sites currently — marginal ROI.

**Context:** Created during T14 (audit explainer). Both MCP and CLI surfaces need to construct an LLM callback from env vars. The factory takes `(anthropicKey, openaiKey)` and returns `(prompt: string) => Promise<string>`. Natural home: `packages/core/src/llm-factory.ts` or a new `packages/core/src/explain-llm.ts`.

**Effort estimate:** S (~15 min)

**Priority:** P3

**Depends on:** Nothing.

---

## T17: Type-safe CLI config for local storage path

**What:** `packages/cli/src/commands.ts` uses `(cfg as any).boards?.local?.storagePath` to access the local board storage path, bypassing `ConsensusCliConfig` types.

**Why:** If the config shape changes, this silently falls through to the default path without warning. The `as any` cast hides the missing field.

**Pros:** Type safety — compiler catches config shape changes. Removes the only `as any` in the CLI.

**Cons:** Requires extending `ConsensusCliConfig` type with an optional `storagePath` field, or adding a typed accessor.

**Context:** Created during T14. The `explain` command needs to open local storage directly (unlike other CLI commands which use the remote SDK client). The fallback `"./data/local-board.json"` is reasonable but the access pattern should be typed.

**Effort estimate:** S (~15 min)

**Priority:** P3

**Depends on:** Nothing.
