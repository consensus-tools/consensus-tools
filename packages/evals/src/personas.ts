/**
 * Persona re-exports for backwards compatibility.
 * Canonical types and defaults now live in @consensus-tools/personas.
 */
import type { EvalPersonaConfig } from "@consensus-tools/personas";
import { getEvalPersonas } from "@consensus-tools/personas";

// Re-export EvalPersonaConfig under the old name for backwards compat.
// EvalPersonaConfig has systemPrompt and evaluationFocus as required string,
// preserving the original AgentPersona contract.
export type AgentPersona = EvalPersonaConfig;

export function generatePersonas(count: number = 3): EvalPersonaConfig[] {
  return getEvalPersonas("default", count);
}

export function generateSkillReviewPersonas(): EvalPersonaConfig[] {
  return getEvalPersonas("skill-review");
}

export function respawnPersona(personas: EvalPersonaConfig[], replaceId?: string): EvalPersonaConfig[] {
  if (!replaceId) return personas;
  const available = getEvalPersonas("default").filter(
    (p) => !personas.some((existing) => existing.id === p.id),
  );
  if (available.length === 0) return personas;
  const replacement = available[0]!;
  return personas.map((p) => (p.id === replaceId ? replacement : p));
}
