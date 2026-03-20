// Existing exports (preserved)
export { evaluateWithAiSdk, type AiEvaluatorConfig } from "./evaluator.js";
export { generatePersonas, generateSkillReviewPersonas, respawnPersona, type AgentPersona } from "./personas.js";

// New: types
export type {
  JudgeScore,
  AgentEvalScore,
  ConsensusEvalResult,
  ReputationDelta,
  ReputationState,
  ReputationStorage,
  PromptBuilder,
} from "./types.js";

// New: validation
export { validateScore, validateJudgeScore } from "./validation.js";

// New: consensus eval
export { consensusEval, weightedComposite, parseABResponse, type ConsensusEvalOptions } from "./consensus-eval.js";

// New: reputation
export { ReputationTracker } from "./reputation.js";

// New: proposer
export {
  proposeImprovement,
  buildProposerSystemPrompt,
  buildProposerUserPrompt,
  computeSimpleDiff,
  selectProposer,
  type Proposal,
  type ProposerConfig,
  type LLMCaller,
} from "./proposer.js";

// New: vote parser
export { parseVote, type ParsedVote, type AgentWithRep } from "./vote-parser.js";

// New: guard prompt
export { buildDiffGuardPrompt } from "./guard-prompt.js";
