export interface EvalVote {
  agentId: string;
  agentName: string;
  vote: "YES" | "NO" | "REWRITE";
  risk: number;
  reason: string;
  reputation: number;
}

export interface VersionEvalResult {
  id: string;
  timestamp: string;
  scenario: "skill-md";
  mode: "single" | "consensus";
  model: string;
  skill: string;
  versionA: string;
  versionB: string;
  proposalId: string;
  batchId: string;
  diffSummary: string;
  fullDiff: string;
  votes: EvalVote[];
  decision: string;
  combinedRisk: number;
  quorumMet: boolean;
  weightedYesRatio: number;
  durationMs: number;
}
