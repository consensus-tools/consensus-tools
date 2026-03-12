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
} from "./policy.js";

// ── Resolver ─────────────────────────────────────────────────────────
export {
  type ConsensusInput,
  type ConsensusResult,
  type PolicyResolver,
} from "./resolver.js";

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

// ── Guard ───────────────────────────────────────────────────────────
export {
  guardTypeSchema,
  type GuardType,
  guardDecisionSchema,
  type GuardDecision,
  guardVoteValueSchema,
  type GuardVoteValue,
  guardVoteSchema,
  type GuardVote,
  weightedGuardVoteSchema,
  type WeightedGuardVote,
  guardPolicySchema,
  type GuardPolicy,
  guardEvaluateInputSchema,
  type GuardEvaluateInput,
  guardEvaluateRequestSchema,
  type GuardEvaluateRequest,
  guardResultSchema,
  type GuardResult,
  weightingModeSchema,
  type WeightingMode,
  type VoteTally,
  humanApprovalRequestSchema,
  type HumanApprovalRequest,
  parseHumanApprovalYesNo,
} from "./guard.js";

// ── Agent ───────────────────────────────────────────────────────────
export {
  agentKindSchema,
  type AgentKind,
  agentStatusSchema,
  type AgentStatus,
  agentSchema,
  type Agent,
  agentConfigSchema,
  type AgentConfig,
} from "./agent.js";

// ── Participant ─────────────────────────────────────────────────────
export {
  participantSubjectTypeSchema,
  type ParticipantSubjectType,
  participantStatusSchema,
  type ParticipantStatus,
  participantSchema,
  type Participant,
} from "./participant.js";

// ── Workflow ────────────────────────────────────────────────────────
export {
  workflowStatusSchema,
  type WorkflowStatus,
  workflowSchema,
  type Workflow,
  workflowRunSchema,
  type WorkflowRun,
  cronScheduleSchema,
  type CronSchedule,
} from "./workflow.js";

// ── Policy Assignment ──────────────────────────────────────────────
export {
  policyAssignmentSchema,
  type PolicyAssignment,
  consensusVoteSchema,
  type ConsensusVote,
} from "./policy-assignment.js";

// ── HITL ────────────────────────────────────────────────────────────
export {
  hitlModeSchema,
  type HitlMode,
  hitlStatusSchema,
  type HitlStatus,
  hitlApprovalSchema,
  type HitlApproval,
  humanDecisionSchema,
  type HumanDecision,
} from "./hitl.js";

// ── Input Validation ────────────────────────────────────────────────
export {
  agentIdFieldSchema,
  type AgentIdField,
  jobPostInputSchema,
  type JobPostInput,
  claimInputSchema,
  type ClaimInput,
  submitInputSchema,
  type SubmitInput,
  voteInputSchema,
  type VoteInput,
  resolveInputSchema,
  type ResolveInput,
  workflowCreateInputSchema,
  type WorkflowCreateInput,
  cronRegisterInputSchema,
  type CronRegisterInput,
} from "./inputs.js";
