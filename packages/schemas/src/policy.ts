import { z } from "zod";
import type { Job } from "./job.js";
import type { Submission } from "./submission.js";
import type { Vote } from "./vote.js";

// ── Consensus Policy ────────────────────────────────────────────────

export const consensusPolicyTypeSchema = z.enum([
  "FIRST_SUBMISSION_WINS",
  "HIGHEST_CONFIDENCE_SINGLE",
  "APPROVAL_VOTE",
  "OWNER_PICK",
  "TOP_K_SPLIT",
  "MAJORITY_VOTE",
  "WEIGHTED_VOTE_SIMPLE",
  "WEIGHTED_REPUTATION",
  "TRUSTED_ARBITER",
]);
export type ConsensusPolicyType = z.infer<typeof consensusPolicyTypeSchema>;

export const approvalVoteConfigSchema = z.object({
  weightMode: z.enum(["equal", "explicit", "reputation"]).optional(),
  settlement: z.enum(["immediate", "staked", "oracle"]).optional(),
  oracle: z.literal("trusted_arbiter").optional(),
  voteSlashPercent: z.number().min(0).max(1).optional(),
});
export type ApprovalVoteConfig = z.infer<typeof approvalVoteConfigSchema>;

export const consensusPolicyConfigSchema = z.object({
  type: consensusPolicyTypeSchema,
  trustedArbiterAgentId: z.string().optional(),
  minConfidence: z.number().optional(),
  topK: z.number().optional(),
  ordering: z.enum(["confidence", "score"]).optional(),
  quorum: z.number().optional(),
  minScore: z.number().optional(),
  minMargin: z.number().optional(),
  tieBreak: z.enum(["earliest", "confidence", "arbiter"]).optional(),
  approvalVote: approvalVoteConfigSchema.optional(),
});
export type ConsensusPolicyConfig = z.infer<typeof consensusPolicyConfigSchema>;

export const slashingPolicySchema = z.object({
  enabled: z.boolean(),
  slashPercent: z.number(),
  slashFlat: z.number(),
});
export type SlashingPolicy = z.infer<typeof slashingPolicySchema>;

// ── Policy Resolver Interface ───────────────────────────────────────

/** Input to a policy resolver function. */
export interface ConsensusInput {
  job: Job;
  submissions: Submission[];
  votes: Vote[];
  reputation: (agentId: string) => number;
  manualWinnerAgentIds?: string[];
  manualSubmissionId?: string;
}

/** Output from a policy resolver function. */
export interface ConsensusResult {
  winners: string[];
  winningSubmissionIds: string[];
  consensusTrace: Record<string, unknown>;
  finalArtifact: Record<string, unknown> | null;
}

/**
 * A PolicyResolver takes structured consensus input and produces a
 * deterministic resolution result. Used by the engine to dispatch to
 * built-in or custom policy implementations.
 */
export type PolicyResolver = (input: ConsensusInput) => ConsensusResult;
