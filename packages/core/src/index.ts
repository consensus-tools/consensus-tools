// @consensus-tools/core
// Protocol engine, ledger, and resolution primitives.
// Depends on @consensus-tools/schemas and @consensus-tools/guards.

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
export {
  resolveConsensus,
  firstSubmissionWins,
  highestConfidenceSingle,
  approvalVote,
  ownerPick,
  trustedArbiter,
  topKSplit,
  majorityVote,
  weightedVoteSimple,
  weightedReputation,
} from "./resolve/resolve.js";

// ── Board ───────────────────────────────────────────────────────────
export { LocalBoard } from "./board/board.js";

// ── Ledger ──────────────────────────────────────────────────────────
export { LedgerEngine } from "./ledger/ledger.js";
export { computeBalances, getBalance, ensureNonNegative } from "./ledger/rules.js";

// ── Util ────────────────────────────────────────────────────────────
export { newId, deepCopy } from "./util/helpers.js";
export { nowIso, addSeconds, isPast } from "./util/time.js";

// ── Explain ──────────────────────────────────────────────────────
export {
  explainDecision,
  normalizeGuardVote,
  normalizeReviewResult,
  guardResultToExplainInput,
} from "./explain.js";
export type { LlmFn, ExplainOptions } from "./explain.js";

// ── Audit Summary ────────────────────────────────────────────────
export { summarizeGuardActivity, summarizeFromState, formatSummaryTable } from "./audit-summary.js";
export type { GuardActivityRow, GuardActivityStats, GuardActivitySummary, SummaryFilters } from "./audit-summary.js";
