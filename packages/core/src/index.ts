// @consensus-tools/core
// Protocol engine, ledger, storage, and resolution primitives.
// Depends only on @consensus-tools/schemas.

// ── Engine ──────────────────────────────────────────────────────────
export { JobEngine } from "./engine/engine.js";
export type { JobFilters, JobPostInput, ClaimInput, SubmitInput, VoteInput, ResolveInput } from "./engine/engine.js";
export { checkEligibility } from "./engine/eligibility.js";
export type { EligibilityResult } from "./engine/eligibility.js";
export { calculateSlashAmount } from "./engine/slashing.js";

// ── Resolve ─────────────────────────────────────────────────────────
export { resolveConsensus } from "./resolve/resolve.js";

// ── Board ───────────────────────────────────────────────────────────
export { LocalBoard } from "./board/board.js";

// ── Ledger ──────────────────────────────────────────────────────────
export { LedgerEngine } from "./ledger/ledger.js";
export { computeBalances, getBalance, ensureNonNegative } from "./ledger/rules.js";

// ── Storage ─────────────────────────────────────────────────────────
export type { IStorage } from "./storage/interface.js";
export { defaultState, createStorage } from "./storage/interface.js";
export { JsonStorage } from "./storage/json.js";
export { SqliteStorage } from "./storage/sqlite.js";

// ── Util ────────────────────────────────────────────────────────────
export { newId, deepCopy } from "./util/ids.js";
export { Mutex } from "./util/locks.js";
export { nowIso, addSeconds, isPast } from "./util/time.js";
