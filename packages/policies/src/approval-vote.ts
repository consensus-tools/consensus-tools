import type { ConsensusInput, ConsensusResult } from "@consensus-tools/schemas";

function findArtifact(input: ConsensusInput, submissionId?: string): Record<string, unknown> | null {
  if (!submissionId) return null;
  return input.submissions.find((s) => s.id === submissionId)?.artifacts || null;
}

/**
 * APPROVAL_VOTE — tallies weighted votes across submissions. Supports
 * immediate, staked, and oracle settlement modes.
 */
export function approvalVote(input: ConsensusInput): ConsensusResult {
  const policy = "APPROVAL_VOTE";
  const quorum = input.job.consensusPolicy.quorum;
  const minScore = input.job.consensusPolicy.minScore ?? 1;
  const minMargin = input.job.consensusPolicy.minMargin ?? 0;
  const tieBreak = input.job.consensusPolicy.tieBreak ?? "earliest";
  const weightMode = input.job.consensusPolicy.approvalVote?.weightMode ?? "equal";
  const settlement = input.job.consensusPolicy.approvalVote?.settlement ?? "immediate";

  if (settlement === "oracle" && input.manualWinnerAgentIds?.length) {
    return {
      winners: input.manualWinnerAgentIds,
      winningSubmissionIds: input.manualSubmissionId ? [input.manualSubmissionId] : [],
      consensusTrace: { policy, settlement, mode: "manual" },
      finalArtifact: findArtifact(input, input.manualSubmissionId),
    };
  }

  if (!input.submissions.length) {
    return { winners: [], winningSubmissionIds: [], consensusTrace: { policy, reason: "no_submissions" }, finalArtifact: null };
  }

  const scores: Record<string, number> = {};
  const voteCounts: Record<string, number> = {};

  const votes = input.votes.filter((v) => v.submissionId || (v.targetType === "SUBMISSION" && v.targetId));
  if (quorum && votes.length < quorum) {
    return {
      winners: [],
      winningSubmissionIds: [],
      consensusTrace: { policy, settlement, reason: "quorum_not_met", quorum, votes: votes.length },
      finalArtifact: null,
    };
  }

  for (const vote of votes) {
    const sid = vote.submissionId ?? (vote.targetType === "SUBMISSION" ? vote.targetId : undefined);
    if (!sid) continue;
    let weight = 1;
    if (weightMode === "explicit") weight = vote.weight ?? 1;
    if (weightMode === "reputation") weight = input.reputation(vote.agentId);
    const s = Math.max(-1, Math.min(1, vote.score ?? 0));
    scores[sid] = (scores[sid] || 0) + s * weight;
    voteCounts[sid] = (voteCounts[sid] || 0) + 1;
  }

  const ranked = input.submissions
    .map((sub) => ({ sub, score: scores[sub.id] || 0, votes: voteCounts[sub.id] || 0 }))
    .sort((a, b) => {
      if (b.score === a.score) {
        if (tieBreak === "confidence") return b.sub.confidence - a.sub.confidence;
        return Date.parse(a.sub.submittedAt) - Date.parse(b.sub.submittedAt);
      }
      return b.score - a.score;
    });

  const best = ranked[0];
  const second = ranked[1];
  const margin = second ? best!.score - second.score : best?.score ?? 0;

  if (!best || best.votes === 0) {
    return { winners: [], winningSubmissionIds: [], consensusTrace: { policy, settlement, reason: "no_votes", scores, voteCounts }, finalArtifact: null };
  }

  if (best.score < minScore || margin < minMargin) {
    return {
      winners: [],
      winningSubmissionIds: [],
      consensusTrace: { policy, settlement, reason: "threshold_not_met", minScore, minMargin, best: best.score, margin, scores, voteCounts },
      finalArtifact: null,
    };
  }

  if (settlement === "oracle" || tieBreak === "arbiter") {
    if (input.manualWinnerAgentIds?.length) {
      return {
        winners: input.manualWinnerAgentIds,
        winningSubmissionIds: input.manualSubmissionId ? [input.manualSubmissionId] : [],
        consensusTrace: { policy, settlement, mode: "manual", recommendedSubmissionId: best.sub.id, recommendedAgentId: best.sub.agentId, scores, voteCounts },
        finalArtifact: findArtifact(input, input.manualSubmissionId),
      };
    }
    return {
      winners: [],
      winningSubmissionIds: [],
      consensusTrace: { policy, settlement, mode: "awaiting_oracle", recommendedSubmissionId: best.sub.id, recommendedAgentId: best.sub.agentId, scores, voteCounts },
      finalArtifact: null,
    };
  }

  return {
    winners: [best.sub.agentId],
    winningSubmissionIds: [best.sub.id],
    consensusTrace: { policy, settlement, scores, voteCounts, minScore, minMargin, tieBreak },
    finalArtifact: best.sub.artifacts,
  };
}
