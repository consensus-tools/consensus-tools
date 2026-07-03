# @consensus-tools/core

## 0.11.1

### Patch Changes

- 90e0855: Fix guard evaluation and HITL correctness in the MCP adapter:

  - **Guard payload translation:** domain guard tools (`guard.code_merge`, `guard.publish`, `guard.support_reply`, `guard.deployment`, `guard.permission_escalation`, `guard.send_email`) advertised ergonomic payload keys (`filesChanged`, `diff`, `content`, `replyText`, `deployEnv`, `requestedPermissions`, `attachments`) that the evaluators never read, so a payload sent per the advertised schema was silently ALLOWED. The adapter now translates advertised keys onto the evaluator contract, so guards actually inspect what callers send (e.g. a `deployEnv: "prod"` deploy now returns REWRITE, not ALLOW). Translation applies on both the named `guard.<domain>` tools and `guard.evaluate` calls that carry an explicit domain type.
  - **`human.approve`:** the parsed YES/NO/REWRITE decision was discarded — a "NO" resolved the gate exactly like a "YES", and the paused workflow was never resumed. It now persists the decision, resumes the workflow with it (so a NO blocks the guarded action), enforces `idempotencyKey` to prevent replayed double-counting, and returns an error when no pending approval matches the run.
  - **`human.approve` aggregates quorum votes worst-of, not last-writer-wins.** In an N-of-M approval, the workflow now resumes with the most severe decision across every vote in the cycle (NO > REWRITE > YES) — an early NO is a standing veto a later YES cannot overwrite. Votes from a previous, already-resolved approval cycle of the same run are excluded. The idempotency key is also scoped per approver — a second approver reusing another approver's key value casts a new vote instead of being swallowed as a duplicate.
  - **`guard.evaluate`** now rejects a missing `action.type`, and gates the type against the engine's actual evaluator set (`GuardEngine.supportedGuardTypes()`, new in core) rather than the schema enum — schema types with no registered evaluator (`seo_fix`, `diff_check`) would fall through to the permissive generic evaluator and silently ALLOW, while custom domains registered on the engine's evaluator registry are accepted.
  - **`policy.assign`** now validates `weightingMode` and `quorum` (0-1) instead of persisting unchecked values.
  - **`policy.assign` now governs guard evaluations.** Previously an assigned policy was inert — `guard.*` calls ignored it. Guard evaluations now resolve the board's assignment and apply it as the effective policy, so a policy'd board honors quorum and routes high-risk actions to human review (e.g. a prod deploy goes from `REWRITE` to `REQUIRE_HUMAN`). Unassigned boards are unchanged.
  - **`PolicyAssignment` schema** gains two optional per-board risk thresholds — `riskThreshold` and `hitlRequiredAboveRisk` — surfaced through the `policy.assign` MCP tool. When set, they override the policy defaults for that board so operators can tune how aggressively a board escalates to human review. Both are optional; assignments persisted before this change still validate.
  - **Standalone `guard.*` HITL is now wired.** A `guard.*` call that returns `REQUIRE_HUMAN` registers a pending approval keyed on the call's `runId` (minted and returned if the caller didn't supply one), so a later `human.approve` can actually resolve it. The response's `next_step` points at `human.approve` with the `runId`; unanswered escalations auto-`BLOCK` after 15 minutes, matching workflow `hitl` nodes. Previously the decision was a dead end — nothing was registered and `human.approve` returned "No pending approval found".
  - **`permission_escalation` evaluator scans every requested permission.** The evaluator only inspected a single `permission` key and only flagged a literal `"*"` — a scoped wildcard (`iam:*`, `admin:*`) or a wildcard buried in a later `requestedPermissions` entry passed as a "standard change". It now scans `permission` plus the full `requestedPermissions` array: a bare `"*"` anywhere is a NO, and any scoped wildcard (on the permission or the `resource`) escalates to REWRITE. Checks run in descending risk order (bare wildcard 0.95 > break-glass 0.9 > scoped wildcard 0.85 > admin role 0.8), so combining risk factors never lowers the score.
  - **HITL deadline expiry is enforced.** The standalone server now constructs the `HitlTracker` with an `onExpiry` callback that resumes a paused workflow with the approval's auto-decision (BLOCK), so an unanswered escalation actually fails closed instead of leaving the run "waiting" forever. On startup the server re-arms deadline tracking for pending approvals persisted by a previous process (`HitlTracker.resumeDeadlineTracking()`, new in core) — approvals that expired while the server was down resolve immediately.
  - **Startup no longer crashes on a legacy `state.json`** that predates the `cronSchedules` collection (the cron re-arm check now tolerates the missing key).
  - **Guard-registered pending approvals are board-scoped:** an empty-string `runId` is treated as absent (a real id is minted), and reusing a `runId` whose pending approval belongs to a different board is rejected instead of handing the caller a `next_step` that resolves someone else's escalation.
  - **`board.get`** scopes guard results to the requested board (via the audit-event board join) instead of returning every board's results.
  - **Standalone server:** the `WorkflowRunner` is now wired with a node executor (node-graph workflows and HITL nodes actually run), the cron scheduler starts when persisted schedules exist, and the process shuts down cleanly on stdin EOF / SIGINT / SIGTERM (fixes a zombie process after `cron.register`).
  - **`initialize`** reports the version from `package.json` instead of a hardcoded, stale value.
  - **`audit.explain`** returns an actionable error when the optional LLM SDK isn't installed.
  - **`audit.search`** guards against a non-numeric `limit` (no longer returns the whole audit log); a null/omitted `limit` keeps the default of 100.
  - Dropped the unused `@consensus-tools/policies` and `@consensus-tools/wrapper` dependencies and raised the `@modelcontextprotocol/sdk` floor to the tested `^1.27.0`.
  - **Workflow `requireFinalHumanApprovalYes` now fails closed.** The final-human-approval gate on an action node only aborted when a non-YES decision was present; an absent decision (a resume that never injected one) fell through and executed the guarded action as if approved. It now requires an explicit `YES` — missing, `NO`, and `REWRITE` all abort — so it can't be bypassed by an un-injected decision.
  - Hoisted the 15-minute HITL default timeout into a shared `DEFAULT_HITL_TIMEOUT_SEC` constant so the standalone guard adapter and workflow `hitl` nodes can no longer drift apart.
  - Documented a further trust-model boundary: N-of-M vote aggregation is race-safe only under a single sequential writer (the stdio model). A concurrent-writer deployment must serialize `human.approve` per run until per-voter decisions are persisted atomically on the approval record.

- Updated dependencies [90e0855]
  - @consensus-tools/schemas@0.11.1
  - @consensus-tools/guards@0.11.1
  - @consensus-tools/storage@0.11.1

## 0.11.0

### Patch Changes

- `createLlmFn`'s Anthropic default moved off `claude-sonnet-4-20250514` (deprecated, scheduled for retirement) to `claude-sonnet-4-6`.

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

- 5822686: Initial public release — monorepo restructuring from @consensus-tools/consensus-tools@0.2.0.

### Patch Changes

- Updated dependencies [5822686]
  - @consensus-tools/schemas@0.4.0
  - @consensus-tools/guards@0.4.0
