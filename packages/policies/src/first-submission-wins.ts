import type { ConsensusInput, ConsensusResult } from "@consensus-tools/schemas";

/**
 * FIRST_SUBMISSION_WINS — the earliest valid submission wins the job.
 * Simple, fast, no voting needed.
 */
export function firstSubmissionWins(input: ConsensusInput): ConsensusResult {
  if (!input.submissions.length) {
    return { winners: [], winningSubmissionIds: [], consensusTrace: { policy: "FIRST_SUBMISSION_WINS", reason: "no_submissions" }, finalArtifact: null };
  }
  const sorted = [...input.submissions].sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
  const winner = sorted[0]!;
  return {
    winners: [winner.agentId],
    winningSubmissionIds: [winner.id],
    consensusTrace: { policy: "FIRST_SUBMISSION_WINS", method: "first_submission" },
    finalArtifact: winner.artifacts,
  };
}
