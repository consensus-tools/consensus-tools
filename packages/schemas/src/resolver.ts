import type { Job } from "./job.js";
import type { Submission } from "./submission.js";
import type { Vote } from "./vote.js";

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
