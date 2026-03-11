import type { ConsensusInput, ConsensusResult } from "@consensus-tools/schemas";

/**
 * HIGHEST_CONFIDENCE_SINGLE — the submission with the highest declared
 * confidence wins. Supports an optional minConfidence threshold.
 */
export function highestConfidenceSingle(input: ConsensusInput): ConsensusResult {
  const policy = "HIGHEST_CONFIDENCE_SINGLE";
  if (!input.submissions.length) {
    return { winners: [], winningSubmissionIds: [], consensusTrace: { policy, reason: "no_submissions" }, finalArtifact: null };
  }
  const minConfidence = input.job.consensusPolicy.minConfidence ?? 0;
  const sorted = [...input.submissions]
    .filter((sub) => sub.confidence >= minConfidence)
    .sort((a, b) => {
      if (b.confidence === a.confidence) return Date.parse(a.submittedAt) - Date.parse(b.submittedAt);
      return b.confidence - a.confidence;
    });
  const winner = sorted[0];
  if (!winner) {
    return { winners: [], winningSubmissionIds: [], consensusTrace: { policy, reason: "min_confidence_not_met", minConfidence }, finalArtifact: null };
  }
  return {
    winners: [winner.agentId],
    winningSubmissionIds: [winner.id],
    consensusTrace: { policy, minConfidence, method: "highest_confidence" },
    finalArtifact: winner.artifacts,
  };
}
