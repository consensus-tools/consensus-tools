// @consensus-tools/schemas
// Shared types and Zod schemas — the contract layer between all packages.
// This package has NO internal dependencies and is the foundation of the monorepo.

// ── Policy ──────────────────────────────────────────────────────────
export {
  consensusPolicyTypeSchema,
  type ConsensusPolicyType,
  approvalVoteConfigSchema,
  type ApprovalVoteConfig,
  consensusPolicyConfigSchema,
  type ConsensusPolicyConfig,
  slashingPolicySchema,
  type SlashingPolicy,
  type ConsensusInput,
  type ConsensusResult,
  type PolicyResolver,
} from "./policy.js";

// ── Job ─────────────────────────────────────────────────────────────
export {
  jobModeSchema,
  type JobMode,
  jobStatusSchema,
  type JobStatus,
  jobConstraintsSchema,
  type JobConstraints,
  escrowPolicySchema,
  type EscrowPolicy,
  jobSchema,
  type Job,
} from "./job.js";

// ── Submission ──────────────────────────────────────────────────────
export {
  submissionStatusSchema,
  type SubmissionStatus,
  submissionSchema,
  type Submission,
} from "./submission.js";

// ── Vote ────────────────────────────────────────────────────────────
export {
  voteTargetTypeSchema,
  type VoteTargetType,
  voteSchema,
  type Vote,
} from "./vote.js";

// ── Resolution ──────────────────────────────────────────────────────
export {
  resolutionSchema,
  type Resolution,
} from "./resolution.js";

// ── Ledger ──────────────────────────────────────────────────────────
export {
  ledgerEntryTypeSchema,
  type LedgerEntryType,
  ledgerEntrySchema,
  type LedgerEntry,
} from "./ledger.js";

// ── Common ──────────────────────────────────────────────────────────
export {
  claimStatusSchema,
  type ClaimStatus,
  bidSchema,
  type Bid,
  assignmentSchema,
  type Assignment,
  auditEventSchema,
  type AuditEvent,
  diagnosticEntrySchema,
  type DiagnosticEntry,
} from "./common.js";

// ── Storage ─────────────────────────────────────────────────────────
export {
  storageStateSchema,
  type StorageState,
} from "./storage.js";

// ── Config ──────────────────────────────────────────────────────────
export {
  consensusToolsConfigSchema,
  type ConsensusToolsConfig,
} from "./config.js";

// ── Telemetry ───────────────────────────────────────────────────────
export {
  telemetryEventTypeSchema,
  type TelemetryEventType,
  telemetryEventSchema,
  type TelemetryEvent,
  traceSpanSchema,
  type TraceSpan,
} from "./telemetry.js";
