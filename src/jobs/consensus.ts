import type { ConsensusPolicyType, Job, Submission, Vote } from '../types';

export interface ConsensusResult {
  winners: string[];
  winningSubmissionIds: string[];
  consensusTrace: Record<string, unknown>;
  finalArtifact: Record<string, unknown> | null;
}

export interface ConsensusInput {
  job: Job;
  submissions: Submission[];
  votes: Vote[];
  reputation: (agentId: string) => number;
  manualWinnerAgentIds?: string[];
  manualSubmissionId?: string;
}

export function resolveConsensus(input: ConsensusInput): ConsensusResult {
  const policy = input.job.consensusPolicy.type as ConsensusPolicyType;
  if (policy === 'TRUSTED_ARBITER') {
    if (input.manualWinnerAgentIds && input.manualWinnerAgentIds.length) {
      return {
        winners: input.manualWinnerAgentIds,
        winningSubmissionIds: input.manualSubmissionId ? [input.manualSubmissionId] : [],
        consensusTrace: { policy, mode: 'manual' },
        finalArtifact: findArtifact(input, input.manualSubmissionId)
      };
    }
    return {
      winners: [],
      winningSubmissionIds: [],
      consensusTrace: { policy, mode: 'awaiting_arbiter' },
      finalArtifact: null
    };
  }

  if (policy === 'OWNER_PICK') {
    if (input.manualWinnerAgentIds && input.manualWinnerAgentIds.length) {
      return {
        winners: input.manualWinnerAgentIds,
        winningSubmissionIds: input.manualSubmissionId ? [input.manualSubmissionId] : [],
        consensusTrace: { policy, mode: 'manual' },
        finalArtifact: findArtifact(input, input.manualSubmissionId)
      };
    }
    return {
      winners: [],
      winningSubmissionIds: [],
      consensusTrace: { policy, reason: 'no_owner_selection' },
      finalArtifact: null
    };
  }

  if (!input.submissions.length) {
    return { winners: [], winningSubmissionIds: [], consensusTrace: { policy, reason: 'no_submissions' }, finalArtifact: null };
  }

  if (policy === 'SINGLE_WINNER') {
    const sorted = [...input.submissions].sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
    const winner = sorted[0];
    return {
      winners: [winner.agentId],
      winningSubmissionIds: [winner.id],
      consensusTrace: { policy, method: 'first_submission' },
      finalArtifact: winner.artifacts
    };
  }

  if (policy === 'HIGHEST_CONFIDENCE_SINGLE') {
    const minConfidence = input.job.consensusPolicy.minConfidence ?? 0;
    const sorted = [...input.submissions]
      .filter((sub) => sub.confidence >= minConfidence)
      .sort((a, b) => {
        if (b.confidence === a.confidence) {
          return Date.parse(a.submittedAt) - Date.parse(b.submittedAt);
        }
        return b.confidence - a.confidence;
      });
    const winner = sorted[0];
    if (!winner) {
      return {
        winners: [],
        winningSubmissionIds: [],
        consensusTrace: { policy, reason: 'min_confidence_not_met', minConfidence },
        finalArtifact: null
      };
    }
    return {
      winners: [winner.agentId],
      winningSubmissionIds: [winner.id],
      consensusTrace: { policy, minConfidence, method: 'highest_confidence' },
      finalArtifact: winner.artifacts
    };
  }

  if (policy === 'TOP_K_SPLIT') {
    const ordering = input.job.consensusPolicy.ordering ?? 'confidence';
    const topK = Math.max(1, input.job.consensusPolicy.topK ?? 2);
    const scores: Record<string, number> = {};

    if (ordering === 'score') {
      for (const vote of input.votes) {
        if (!vote.submissionId) continue;
        const weight = vote.weight ?? vote.score ?? 1;
        scores[vote.submissionId] = (scores[vote.submissionId] || 0) + (vote.score ?? 1) * weight;
      }
    }

    const ranked = input.submissions
      .map((sub) => ({
        submission: sub,
        metric: ordering === 'score' ? scores[sub.id] || 0 : sub.confidence
      }))
      .sort((a, b) => {
        if (b.metric === a.metric) {
          return Date.parse(a.submission.submittedAt) - Date.parse(b.submission.submittedAt);
        }
        return b.metric - a.metric;
      })
      .slice(0, topK);

    if (!ranked.length) {
      return {
        winners: [],
        winningSubmissionIds: [],
        consensusTrace: { policy, ordering, topK, reason: 'no_submissions' },
        finalArtifact: null
      };
    }

    return {
      winners: ranked.map((entry) => entry.submission.agentId),
      winningSubmissionIds: ranked.map((entry) => entry.submission.id),
      consensusTrace: { policy, ordering, topK, scores },
      finalArtifact: ranked[0].submission.artifacts
    };
  }

  const quorum = input.job.consensusPolicy.quorum;
  if (quorum && input.votes.length < quorum) {
    return {
      winners: [],
      winningSubmissionIds: [],
      consensusTrace: { policy, reason: 'quorum_not_met', quorum, votes: input.votes.length },
      finalArtifact: null
    };
  }

  const scores: Record<string, number> = {};
  const voteCounts: Record<string, number> = {};

  for (const vote of input.votes) {
    let weight = 1;
    if (policy === 'WEIGHTED_REPUTATION') {
      weight = input.reputation(vote.agentId);
    } else if (policy === 'WEIGHTED_VOTE_SIMPLE') {
      weight = vote.weight ?? vote.score ?? 1;
    }
    if (vote.submissionId) {
      scores[vote.submissionId] = (scores[vote.submissionId] || 0) + (vote.score ?? 1) * weight;
      voteCounts[vote.submissionId] = (voteCounts[vote.submissionId] || 0) + 1;
    }
  }

  const best = input.submissions
    .map((sub) => ({
      submission: sub,
      score: scores[sub.id] || 0,
      votes: voteCounts[sub.id] || 0
    }))
    .sort((a, b) => {
      if (b.score === a.score) {
        return Date.parse(a.submission.submittedAt) - Date.parse(b.submission.submittedAt);
      }
      return b.score - a.score;
    })[0];

  return {
    winners: [best.submission.agentId],
    winningSubmissionIds: [best.submission.id],
    consensusTrace: { policy, scores, voteCounts },
    finalArtifact: best.submission.artifacts
  };
}

function findArtifact(input: ConsensusInput, submissionId?: string): Record<string, unknown> | null {
  if (!submissionId) return null;
  const match = input.submissions.find((sub) => sub.id === submissionId);
  return match?.artifacts || null;
}
