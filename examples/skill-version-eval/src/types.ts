export interface JudgeScore {
  clarity: number;       // 1-5
  completeness: number;  // 1-5
  actionability: number; // 1-5
  reasoning: string;
}

export interface AgentJudgeResult {
  agentId: string;
  agentName: string;
  scores: JudgeScore;
}

export interface VersionScore {
  ref: string;
  average: number;             // (clarity + completeness + actionability) / 3
  scores: JudgeScore;          // single: raw scores, consensus: aggregated
  agentResults?: AgentJudgeResult[];  // consensus only: per-agent breakdown
}

export interface VersionEvalResult {
  id: string;
  timestamp: string;
  mode: "single" | "consensus";
  model: string;
  skill: string;
  versionA: VersionScore;
  versionB: VersionScore;
  winner: "A" | "B" | "TIE";   // which version scored higher
  delta: number;                // score difference (B - A)
  proposalId: string;
  diffSummary: string;
  fullDiff: string;
  durationMs: number;
}

// Optional diff guard (triggered by button, not auto-run)
export interface DiffGuardVote {
  agentId: string;
  agentName: string;
  vote: "YES" | "NO" | "REWRITE";
  risk: number;
  reason: string;
}

export interface DiffGuardResult {
  id: string;
  proposalId: string;
  timestamp: string;
  votes: DiffGuardVote[];
  decision: string;
  combinedRisk: number;
  durationMs: number;
}
