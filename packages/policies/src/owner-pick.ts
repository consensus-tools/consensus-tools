import type { ConsensusInput, ConsensusResult } from "@consensus-tools/schemas";

function findArtifact(input: ConsensusInput, submissionId?: string): Record<string, unknown> | null {
  if (!submissionId) return null;
  return input.submissions.find((s) => s.id === submissionId)?.artifacts || null;
}

/**
 * OWNER_PICK — the job creator manually selects the winner.
 */
export function ownerPick(input: ConsensusInput): ConsensusResult {
  const policy = "OWNER_PICK";
  if (input.manualWinnerAgentIds?.length) {
    return {
      winners: input.manualWinnerAgentIds,
      winningSubmissionIds: input.manualSubmissionId ? [input.manualSubmissionId] : [],
      consensusTrace: { policy, mode: "manual" },
      finalArtifact: findArtifact(input, input.manualSubmissionId),
    };
  }
  return { winners: [], winningSubmissionIds: [], consensusTrace: { policy, reason: "no_owner_selection" }, finalArtifact: null };
}
