import type { ConsensusInput, ConsensusResult } from "@consensus-tools/schemas";

function findArtifact(input: ConsensusInput, submissionId?: string): Record<string, unknown> | null {
  if (!submissionId) return null;
  return input.submissions.find((s) => s.id === submissionId)?.artifacts || null;
}

/**
 * TRUSTED_ARBITER — a designated arbiter manually resolves the job.
 */
export function trustedArbiter(input: ConsensusInput): ConsensusResult {
  const policy = "TRUSTED_ARBITER";
  if (input.manualWinnerAgentIds?.length) {
    return {
      winners: input.manualWinnerAgentIds,
      winningSubmissionIds: input.manualSubmissionId ? [input.manualSubmissionId] : [],
      consensusTrace: { policy, mode: "manual" },
      finalArtifact: findArtifact(input, input.manualSubmissionId),
    };
  }
  return { winners: [], winningSubmissionIds: [], consensusTrace: { policy, mode: "awaiting_arbiter" }, finalArtifact: null };
}
