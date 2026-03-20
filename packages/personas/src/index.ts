// @consensus-tools/personas
// Persona lifecycle: types, defaults, reputation, respawn.

export type {
  PersonaConfig,
  EvalPersonaConfig,
  PersonaSet,
  ReputationRuleset,
  ReputationChange,
  ReputationDeltaResult,
  LearningSummary,
  RespawnResult,
} from "./types.js";

export { getPersonasByPack, getEvalPersonas, PERSONA_PACKS } from "./defaults.js";

export { updateReputation, DEFAULT_RULESET } from "./reputation.js";

export { buildLearningSummary, mutatePersona } from "./respawn.js";
