import crypto from "node:crypto";
import type { PersonaConfig, ReputationRuleset, ReputationChange, ReputationDeltaResult } from "./types.js";

/**
 * Deterministic reputation update engine.
 * Ported from consensus-persona-engine.
 *
 * Rules:
 *   Aligned with final decision   → +rewardAligned
 *   Misaligned                     → +penalizeMisaligned (negative)
 *   Misaligned + high confidence   → +penalizeMisaligned + highConfidencePenaltyBoost
 *   Reputation clamped to [minRep, maxRep]
 */

export const DEFAULT_RULESET: ReputationRuleset = {
  rewardAligned: 0.02,
  penalizeMisaligned: -0.03,
  highConfidencePenaltyBoost: -0.02,
  minRep: 0.05,
  maxRep: 0.95,
};

interface VoteInput {
  persona_id: string;
  vote: string;
  confidence: number;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function isAligned(vote: string, decision: string): boolean {
  return (
    (decision === "ALLOW" && vote === "YES") ||
    (decision === "BLOCK" && vote === "NO") ||
    (decision === "REQUIRE_REWRITE" && vote === "REWRITE")
  );
}

export function updateReputation(
  votes: VoteInput[],
  finalDecision: string,
  personas: PersonaConfig[],
  ruleset?: ReputationRuleset,
): ReputationDeltaResult {
  const rules = ruleset ?? DEFAULT_RULESET;
  const byId = new Map(personas.map((p) => [p.id, p]));
  const changes: ReputationChange[] = [];

  for (const v of votes) {
    const persona = byId.get(v.persona_id);
    if (!persona) continue;

    const before = persona.reputation ?? 0.5;
    const aligned = isAligned(v.vote, finalDecision);
    let delta = aligned ? rules.rewardAligned : rules.penalizeMisaligned;
    if (!aligned && v.confidence >= 0.8) delta += rules.highConfidencePenaltyBoost;

    const after = clamp(before + delta, rules.minRep, rules.maxRep);

    changes.push({
      persona_id: v.persona_id,
      reputation_before: before,
      delta,
      reputation_after: after,
      reasons: [aligned ? "aligned_with_final_decision" : "misaligned_with_final_decision"],
    });
  }

  return {
    reputation_delta_id: crypto.randomUUID(),
    board_id: "",
    decision_id: null,
    persona_set_id: null,
    ruleset: rules,
    changes,
    created_at: new Date().toISOString(),
  };
}
