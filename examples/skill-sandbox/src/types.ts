export interface Rubric {
  claims: string[];        // What the skill claims to do
  weakPoints: string[];    // Identified areas likely to hallucinate
  testPrompt: string;      // The consensus-verified prompt to test the skill
  agentVotes: RubricVote[];
}

export interface RubricVote {
  agentId: string;
  agentName: string;
  claims: string[];
  weakPoints: string[];
  suggestedPrompt: string;
}

export interface HallucinationFinding {
  category: "fabricated_file" | "fabricated_command" | "wrong_behavior" | "contradicts_repo" | "accurate";
  description: string;
  severity: "high" | "medium" | "low";
  evidence: string;
}

export interface CheckResult {
  agentId: string;
  agentName: string;
  vote: "YES" | "NO" | "REWRITE";
  risk: number;
  findings: HallucinationFinding[];
  reason: string;
}

export interface SandboxRunLog {
  id: string;
  timestamp: string;
  skill: string;
  repo: string;
  version: string;
  model: string;
  rubric: Rubric;
  executionOutput: string;
  checkResults: CheckResult[];
  decision: string;
  combinedRisk: number;
  hallucinationCount: number;
  durationMs: number;
}
