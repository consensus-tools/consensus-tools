import type { ConsensusInput, ConsensusResult } from "@consensus-tools/schemas";

/**
 * TOP_K_SPLIT — selects the top K submissions by confidence or vote score,
 * splitting the reward between them.
 */
export function topKSplit(input: ConsensusInput): ConsensusResult {
  const policy = "TOP_K_SPLIT";
  if (!input.submissions.length) {
    return { winners: [], winningSubmissionIds: [], consensusTrace: { policy, reason: "no_submissions" }, finalArtifact: null };
  }

  const ordering = input.job.consensusPolicy.ordering ?? "confidence";
  const topK = Math.max(1, input.job.consensusPolicy.topK ?? 2);
  const scores: Record<string, number> = {};

  if (ordering === "score") {
    for (const vote of input.votes) {
      if (!vote.submissionId) continue;
      const weight = vote.weight ?? vote.score ?? 1;
      scores[vote.submissionId] = (scores[vote.submissionId] || 0) + (vote.score ?? 1) * weight;
    }
  }

  const ranked = input.submissions
    .map((sub) => ({ submission: sub, metric: ordering === "score" ? scores[sub.id] || 0 : sub.confidence }))
    .sort((a, b) => {
      if (b.metric === a.metric) return Date.parse(a.submission.submittedAt) - Date.parse(b.submission.submittedAt);
      return b.metric - a.metric;
    })
    .slice(0, topK);

  return {
    winners: ranked.map((e) => e.submission.agentId),
    winningSubmissionIds: ranked.map((e) => e.submission.id),
    consensusTrace: { policy, ordering, topK, scores },
    finalArtifact: ranked[0]!.submission.artifacts,
  };
}
