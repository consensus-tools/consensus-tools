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

---

## T18: consensus-autopilot state.jsonl rotation

**What:** Cap the Phase 3.1 novelty-bump scan to last 100 entries of state.jsonl, or implement log rotation when state.jsonl exceeds 10MB.

**Why:** Phase 3.1 risk scoring's "any prior pre-flight panel REWROTE this skill's args" novelty bump grows linearly with run history. Becomes a noticeable per-node cost after ~100 runs in a repo.

**Pros:** Bounds the scan cost. Keeps long-running repos fast.

**Cons:** Loses signal from older runs (truncated novelty detection). Rotation adds operational complexity.

**Context:** Surfaced by /plan-eng-review on 2026-05-21 for consensus-autopilot v0.1 plan. Deferred to v0.2 because v0.1 has zero runs; problem is theoretical until usage data exists.

**Depends on:** consensus-autopilot v0.1 ships.

---

## T19: consensus-autopilot state.jsonl schema validation

**What:** Add defensive `jq -e .` validation when reading state.jsonl in Phase 3.1 (novelty scan) and Phase 4.1 (respawn candidate search). Log + skip malformed lines.

**Why:** A malformed entry (manual edit, partial write from a crash, concurrent-write race that the lockfile doesn't fully prevent) silently breaks downstream phases. No error surfaces; the gate just behaves wrong.

**Pros:** Defensive against operational corruption. Cheap (~10 lines per read site).

**Cons:** Adds noise to bash blocks; one more failure mode to test.

**Context:** Surfaced by /plan-eng-review on 2026-05-21 for consensus-autopilot v0.1 plan. P3 because rare in practice but bad when it happens.

**Depends on:** consensus-autopilot v0.1 ships.

---

## T20: consensus-autopilot prompt-cache persona content

**What:** Wire Anthropic prompt caching for persona .md content that's repeated across reviewer dispatches within a single run (and across post-flight judges that re-read the same persona).

**Why:** Each persona's full .md is shipped in every reviewer dispatch. Personas don't change within a run. Prompt caching can cut reviewer-dispatch cost by ~50% on multi-gate runs.

**Pros:** Real cost reduction at scale. Pattern is documented in claude-api skill.

**Cons:** Requires Agent tool surface to support cache_control hints (verify before building). Adds plan complexity for a v0.1 cost that isn't measured yet.

**Context:** Surfaced by /plan-eng-review on 2026-05-21 for consensus-autopilot v0.1 plan. Deferred to v0.2 once token cost is measured.

**Depends on:** consensus-autopilot v0.1 ships AND Agent tool supports prompt-cache hints.

---

## T21: consensus-autopilot Windows/WSL compatibility

**What:** Test and document consensus-autopilot on Windows. Phase 0 uses bash + jq + yq + bc — Windows users need WSL.

**Why:** v0.1 ships POSIX-only. Any Windows power-user wanting to try it will hit unclear failures.

**Pros:** Broader platform reach. Captures the gap before users hit it.

**Cons:** Most active users today are macOS; Windows support is speculative until requested.

**Context:** Surfaced by /plan-devex-review on 2026-05-22 for consensus-autopilot v0.1 plan. Persona was solo macOS power-user; Windows wasn't in scope.

**Depends on:** consensus-autopilot v0.1 ships AND a Windows user actually requests support.

---

## ~~T22: consensus-autopilot --explain / --why-tier introspection~~ — SHIPPED in v0.1.2 (2026-05-23)

Shipped as `--explain <node_id>` with optional `--run-id <id>` for historical lookups. ~140 LoC in the Special-tokens appendix + 6 LoC in the arg parser. Includes pre-flight votes, post-flight judges, and prior-3 invocations of the same skill (filters out the current run's own gate event). Read-only — no LLM dispatch.

---

## T23: consensus-autopilot in-place status banner

**What:** Replace the per-node `echo "NODE $_NODE_ID: ..."` scrolling output with an in-place single-line status banner that updates (Codex CLI / pnpm pattern). Detect terminal capability (TTY only); fall back to scrolling output in non-TTY contexts.

**Why:** A 10-node DAG with ~6 status echoes per node = 60+ lines of scrolling chrome. Long runs become unscannable. In-place banner keeps the active state visible without losing history.

**Pros:** Watchable long runs. Matches modern CLI UX. Power users will notice; everyone else benefits.

**Cons:** Requires terminal capability detection + ANSI escape handling. Easy to get wrong (CI logs, non-TTY pipes).

**Context:** Surfaced by /plan-devex-review outside voice on 2026-05-22 for consensus-autopilot v0.1 plan. Pattern proven in Codex CLI and pnpm; not novel work.

**Depends on:** consensus-autopilot v0.1 ships.

---

## T24: consensus-autopilot live execution tree (pnpm-style)

**What:** During Phase 3 DAG execution, render the DAG as a live tree with per-node timing, collapsed sub-steps (pre-flight panel, judge dispatch), and color-coded outcomes (✓ ALLOW, ✗ BLOCK, ? HITL pending). Similar to `pnpm install` output.

**Why:** Phase 5 final report shows the DAG post-hoc. During the 47-min run itself, user has no compact view of progress. A live tree makes the whole run watchable on one screen.

**Pros:** Best-in-class progress UX. Could be the magical moment for return users (first invocation = persona genesis; subsequent invocations = live tree).

**Cons:** Bigger surface (~80 lines + ANSI handling). Pairs naturally with T23 (in-place banner).

**Context:** Surfaced by /plan-devex-review outside voice on 2026-05-22 for consensus-autopilot v0.1 plan. Deferred to v0.2 since v0.1 = personal infra.

**Depends on:** consensus-autopilot v0.1 ships AND T23 lands first (shared terminal-handling primitives).

---

## ~~T25: consensus-autopilot quiet mode (--quiet flag)~~ — SHIPPED in v0.1.2 (2026-05-23)

Shipped as `--quiet`. Adds a `_Q "..."` ambient-echo helper that gates on `$_QUIET_FLAG`; defined in the arg parser and re-exported through `env.sh` so it survives `source` across phase bash blocks. 14 ambient `echo` sites converted to `_Q` (paths, lockfile lifecycle, RTK status, telemetry env state, payload/roster/artifact references, per-persona reputation delta lines). Preserved as plain `echo`: intent, DAG summary, NODE start/complete, VOTE OUTCOME, POST-FLIGHT, RESPAWNED, RUN summary, AskUserQuestion, ERROR. When combined with `--json`, Phase 5.2 reduces the final summary to just the JSON path. HARD RULES section documents the split.
