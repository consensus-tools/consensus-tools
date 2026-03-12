// @consensus-tools/core
// Protocol engine, ledger, storage, and resolution primitives.
// Depends only on @consensus-tools/schemas.

// ── Engine ──────────────────────────────────────────────────────────
export { JobEngine } from "./engine/engine.js";
export type { JobFilters, JobPostInput, ClaimInput, SubmitInput, VoteInput, ResolveInput } from "./engine/engine.js";
export { checkEligibility } from "./engine/eligibility.js";
export type { EligibilityResult } from "./engine/eligibility.js";
export { calculateSlashAmount } from "./engine/slashing.js";
export { AgentRegistry } from "./engine/agent-registry.js";
export { GuardEngine } from "./engine/guard-engine.js";
export type { GuardEngineOptions } from "./engine/guard-engine.js";
export { HitlTracker } from "./engine/hitl-tracker.js";
export type { NotificationDispatcher, HitlTrackerOptions } from "./engine/hitl-tracker.js";

// ── Resolve ─────────────────────────────────────────────────────────
export { resolveConsensus } from "./resolve/resolve.js";

// ── Board ───────────────────────────────────────────────────────────
export { LocalBoard } from "./board/board.js";

// ── Ledger ──────────────────────────────────────────────────────────
export { LedgerEngine } from "./ledger/ledger.js";
export { computeBalances, getBalance, ensureNonNegative } from "./ledger/rules.js";

// ── Storage ─────────────────────────────────────────────────────────
export type { IStorage } from "./storage/interface.js";
export { defaultState } from "./storage/interface.js";
export { createStorage } from "./storage/factory.js";
export { JsonStorage } from "./storage/json.js";
export { SqliteStorage } from "./storage/sqlite.js";

// ── Util ────────────────────────────────────────────────────────────
export { newId, deepCopy } from "./util/ids.js";
export { Mutex } from "./util/locks.js";
export { nowIso, addSeconds, isPast } from "./util/time.js";
