import type { ConsensusInput, ConsensusResult } from "@consensus-tools/schemas";

/**
 * MAJORITY_VOTE — simple majority wins. Each voter has equal weight.
 */
export function majorityVote(input: ConsensusInput): ConsensusResult {
  return voteBased(input, "MAJORITY_VOTE", () => 1);
}

/**
 * WEIGHTED_VOTE_SIMPLE — voters provide explicit weights.
 */
export function weightedVoteSimple(input: ConsensusInput): ConsensusResult {
  return voteBased(input, "WEIGHTED_VOTE_SIMPLE", (vote) => vote.weight ?? vote.score ?? 1);
}

/**
 * WEIGHTED_REPUTATION — weight comes from the reputation function.
 */
export function weightedReputation(input: ConsensusInput): ConsensusResult {
  return voteBased(input, "WEIGHTED_REPUTATION", (_vote, rep) => rep);
}

function voteBased(
  input: ConsensusInput,
  policy: string,
  getWeight: (vote: { weight?: number; score?: number; agentId: string }, rep: number) => number,
): ConsensusResult {
  if (!input.submissions.length) {
    return { winners: [], winningSubmissionIds: [], consensusTrace: { policy, reason: "no_submissions" }, finalArtifact: null };
  }

  const quorum = input.job.consensusPolicy.quorum;
  if (quorum && input.votes.length < quorum) {
    return { winners: [], winningSubmissionIds: [], consensusTrace: { policy, reason: "quorum_not_met", quorum, votes: input.votes.length }, finalArtifact: null };
  }

  const scores: Record<string, number> = {};
  const voteCounts: Record<string, number> = {};

  for (const vote of input.votes) {
    if (!vote.submissionId) continue;
    const weight = getWeight(vote, input.reputation(vote.agentId));
    scores[vote.submissionId] = (scores[vote.submissionId] || 0) + (vote.score ?? 1) * weight;
    voteCounts[vote.submissionId] = (voteCounts[vote.submissionId] || 0) + 1;
  }

  const best = input.submissions
    .map((sub) => ({ submission: sub, score: scores[sub.id] || 0, votes: voteCounts[sub.id] || 0 }))
    .sort((a, b) => {
      if (b.score === a.score) return Date.parse(a.submission.submittedAt) - Date.parse(b.submission.submittedAt);
      return b.score - a.score;
    })[0]!;

  return {
    winners: [best.submission.agentId],
    winningSubmissionIds: [best.submission.id],
    consensusTrace: { policy, scores, voteCounts },
    finalArtifact: best.submission.artifacts,
  };
}
