/**
 * Persona types for consensus-tools.
 *
 * PersonaConfig is the canonical persona type used across the system:
 * - Evaluation personas (evals) use: id, name, role, systemPrompt, evaluationFocus
 * - Lifecycle personas (guards, respawn) use: id, name, role, reputation, bias, non_negotiables, failure_modes
 * - All fields except id/name/role are optional to support both use cases.
 */

/** Base persona configuration. All personas have id, name, role. */
export interface PersonaConfig {
  id: string;
  name: string;
  role: string;
  reputation?: number;
  bias?: string;
  non_negotiables?: string[];
  failure_modes?: string[];
}

/** Evaluation persona with required prompt fields (used by evals, skill-version-eval). */
export interface EvalPersonaConfig extends PersonaConfig {
  systemPrompt: string;
  evaluationFocus: string;
}

/** A set of personas with metadata. */
export interface PersonaSet {
  persona_set_id: string;
  board_id?: string;
  created_at: string;
  updated_at?: string;
  personas: PersonaConfig[];
  meta?: {
    pack?: string;
    domain?: string;
  };
  lineage?: {
    parent_persona_set_id: string;
  };
}

/** Configurable rules for reputation updates. */
export interface ReputationRuleset {
  rewardAligned: number;
  penalizeMisaligned: number;
  highConfidencePenaltyBoost: number;
  minRep: number;
  maxRep: number;
}

/** One persona's reputation change from a vote batch. */
export interface ReputationChange {
  persona_id: string;
  reputation_before: number;
  delta: number;
  reputation_after: number;
  reasons: string[];
}

/** Result of a reputation update across a persona set. */
export interface ReputationDeltaResult {
  reputation_delta_id: string;
  board_id: string;
  decision_id: string | null;
  persona_set_id: string | null;
  ruleset: ReputationRuleset;
  changes: ReputationChange[];
  created_at: string;
}

/** Learning summary from decision history analysis. */
export interface LearningSummary {
  source_decisions: number;
  mistake_patterns: string[];
}

/** Result of a persona respawn operation. */
export interface RespawnResult {
  board_id: string;
  respawn_id: string;
  timestamp: string;
  replaced_persona_id: string;
  new_persona: PersonaConfig;
  learning_summary: LearningSummary;
}
