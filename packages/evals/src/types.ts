import type { AgentPersona } from "./personas.js";

/** Scored evaluation on three dimensions (1-5 each). */
export interface JudgeScore {
  clarity: number;
  completeness: number;
  actionability: number;
  reasoning: string;
}

/** A single agent's A/B evaluation result. */
export interface AgentEvalScore {
  agentId: string;
  agentName: string;
  reputation: number;
  aScores: JudgeScore;
  bScores: JudgeScore;
  winner: "A" | "B" | "TIE";
  reasoning: string;
}

/** Composite result from multi-agent consensus evaluation. */
export interface ConsensusEvalResult {
  aComposite: JudgeScore;
  bComposite: JudgeScore;
  winner: "A" | "B" | "TIE" | "UNKNOWN";
  agreement: number;
  delta: { clarity: number; completeness: number; actionability: number };
  perAgent: AgentEvalScore[];
  quorumMet: boolean;
}

/** A reputation change for one agent. */
export interface ReputationDelta {
  agentId: string;
  delta: number;
  reason: string;
  newReputation: number;
}

/** Persisted reputation state. */
export interface ReputationState {
  reputations: Record<string, number>;
  totalRounds: number;
  lastUpdated: string;
}

/** Storage interface for reputation persistence. */
export interface ReputationStorage {
  load(): Promise<ReputationState | null>;
  save(state: ReputationState): Promise<void>;
}

/**
 * Function that builds the A/B comparison prompt for a specific agent.
 * The caller provides this to make consensusEval domain-agnostic.
 */
export type PromptBuilder = (
  agent: AgentPersona & { reputation: number },
  versionA: string,
  versionB: string,
) => string;
