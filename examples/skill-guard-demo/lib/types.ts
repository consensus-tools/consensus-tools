import type { GuardDecision, VoteTally } from "@consensus-tools/schemas";

// Re-export shared types from @consensus-tools/evals
export type {
  JudgeScore,
  AgentEvalScore,
  ConsensusEvalResult,
  ReputationDelta,
} from "@consensus-tools/evals";

import type { JudgeScore, ReputationDelta } from "@consensus-tools/evals";

// Demo-specific types

export interface SkillAgent {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  evaluationFocus: string;
  reputation: number;
}

export interface SkillProposal {
  agentId: string;
  skillName: string;
  originalContent: string;
  proposedContent: string;
  changeSummary: string;
}

export interface GuardVoteResult {
  evaluator: string;
  vote: "YES" | "NO" | "REWRITE";
  risk: number;
  reason: string;
}

export interface GuardPipelineResult {
  decision: GuardDecision;
  votes: GuardVoteResult[];
  combinedRisk: number;
  quorumMet: boolean;
  weightedYesRatio: number;
  tally: VoteTally;
}

export interface RoundResult {
  round: number;
  skill: string;
  proposer: string;
  proposal: SkillProposal;
  guardResult: GuardPipelineResult;
  judgeScores: JudgeScore;
  reputationDeltas: ReputationDelta[];
  rewriteCount: number;
  accepted: boolean;
}
