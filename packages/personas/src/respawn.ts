import crypto from "node:crypto";
import type { PersonaConfig, LearningSummary } from "./types.js";

/**
 * Persona respawn — learning + mutation.
 * Ported from consensus-persona-respawn.
 *
 * buildLearningSummary: analyzes past decisions to find mistake patterns
 * mutatePersona: creates a successor persona informed by learning
 */

interface DecisionRecord {
  final_decision?: string;
  votes?: Array<{
    persona_id: string;
    vote: string;
    confidence?: number;
    red_flags?: string[];
  }>;
  response?: {
    final_decision?: string;
    votes?: Array<{
      persona_id: string;
      vote: string;
      confidence?: number;
      red_flags?: string[];
    }>;
  };
}

export function buildLearningSummary(
  personaId: string,
  decisions: DecisionRecord[],
): LearningSummary {
  const patterns = new Map<string, number>();
  let considered = 0;

  for (const d of decisions) {
    const votes = d.votes ?? d.response?.votes ?? [];
    const final = d.final_decision ?? d.response?.final_decision;
    const v = votes.find((x) => x.persona_id === personaId);
    if (!v || !final) continue;

    considered += 1;

    // Normalize: system uses ALLOW/BLOCK/REQUIRE_REWRITE (not APPROVE/REWRITE)
    const opposite =
      ((final === "ALLOW" || final === "APPROVE") && v.vote !== "YES") ||
      (final === "BLOCK" && v.vote !== "NO") ||
      ((final === "REQUIRE_REWRITE" || final === "REWRITE") && v.vote !== "REWRITE");

    if (opposite && (v.confidence ?? 0) > 0.85) {
      patterns.set("high_confidence_mismatch", (patterns.get("high_confidence_mismatch") ?? 0) + 1);
    }

    for (const rf of v.red_flags ?? []) {
      patterns.set(`red_flag:${rf}`, (patterns.get(`red_flag:${rf}`) ?? 0) + 1);
    }
  }

  return {
    source_decisions: considered,
    mistake_patterns: [...patterns.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`),
  };
}

export function mutatePersona(
  oldPersona: PersonaConfig,
  learning: LearningSummary,
): PersonaConfig {
  const top = learning.mistake_patterns.slice(0, 3);
  return {
    ...oldPersona,
    id: `persona_${crypto.randomUUID().slice(0, 8)}`,
    name: `${oldPersona.name} v2`,
    bias: `Adjusted from ledger mistakes (${top.join(", ") || "none"})`,
    non_negotiables: [
      ...new Set([...(oldPersona.non_negotiables ?? []), "Validate high-confidence disagreement"]),
    ],
    failure_modes: [
      ...new Set([...(oldPersona.failure_modes ?? []), "Overconfidence without evidence"]),
    ],
    reputation: 0.55,
  };
}
