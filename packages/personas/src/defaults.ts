import type { PersonaConfig, EvalPersonaConfig } from "./types.js";

/**
 * Named persona packs.
 *
 * "default"      — 3 evaluation personas (security, compliance, operations)
 * "skill-review" — 5 specialists for SKILL.md evaluation
 * "governance"   — 5 lifecycle personas for consensus voting (with reputation)
 */

const DEFAULT_PERSONAS: EvalPersonaConfig[] = [
  {
    id: "security-analyst",
    name: "Security Analyst",
    role: "security",
    systemPrompt: "You are a security-focused reviewer. Evaluate actions for potential security risks, data exposure, and unauthorized access patterns.",
    evaluationFocus: "security vulnerabilities, credential exposure, injection attacks",
  },
  {
    id: "compliance-officer",
    name: "Compliance Officer",
    role: "compliance",
    systemPrompt: "You are a compliance-focused reviewer. Evaluate actions for regulatory compliance, policy adherence, and audit trail completeness.",
    evaluationFocus: "regulatory compliance, data handling policies, audit requirements",
  },
  {
    id: "operations-engineer",
    name: "Operations Engineer",
    role: "operations",
    systemPrompt: "You are an operations-focused reviewer. Evaluate actions for reliability, blast radius, and operational safety.",
    evaluationFocus: "service reliability, change management, rollback capability",
  },
];

const SKILL_REVIEW_PERSONAS: EvalPersonaConfig[] = [
  {
    id: "doc-architect",
    name: "Doc Architect",
    role: "structure",
    systemPrompt: "You evaluate documents for logical structure, heading hierarchy, information flow, and progressive disclosure.",
    evaluationFocus: "document structure, heading hierarchy, progressive disclosure, section ordering",
  },
  {
    id: "api-accuracy",
    name: "API Accuracy Checker",
    role: "accuracy",
    systemPrompt: "You verify that every command, flag, and argument is correctly documented with valid values and types.",
    evaluationFocus: "command names, flags, arguments, return values match ground truth exactly",
  },
  {
    id: "agent-usability",
    name: "Agent Usability Tester",
    role: "usability",
    systemPrompt: "You read documents from the perspective of an AI agent that must use the tool without human help.",
    evaluationFocus: "can an AI agent execute the full task from this doc alone? zero-guess invocations?",
  },
  {
    id: "completeness-auditor",
    name: "Completeness Auditor",
    role: "completeness",
    systemPrompt: "You check for missing commands, undocumented edge cases, error handling gaps, and uncovered scenarios.",
    evaluationFocus: "missing commands, undocumented edge cases, gaps in scoring rubrics or decision criteria",
  },
  {
    id: "style-guardian",
    name: "Style Guardian",
    role: "style",
    systemPrompt: "You enforce formatting consistency: uniform heading levels, consistent command synopsis format, aligned tables, proper markdown syntax.",
    evaluationFocus: "consistent markdown formatting, table alignment, code block tags, cross-skill template compliance",
  },
];

const GOVERNANCE_PERSONAS: PersonaConfig[] = [
  {
    id: "reliability-sentinel",
    name: "Reliability Sentinel",
    role: "reliability",
    reputation: 0.55,
    bias: "failure-first",
    non_negotiables: ["Rollback path required"],
    failure_modes: ["overconfidence"],
  },
  {
    id: "security-gatekeeper",
    name: "Security Gatekeeper",
    role: "security",
    reputation: 0.55,
    bias: "least-privilege",
    non_negotiables: ["No wildcard privileges"],
    failure_modes: ["excessive trust"],
  },
  {
    id: "operations-realist",
    name: "Operations Realist",
    role: "operations",
    reputation: 0.55,
    bias: "operability",
    non_negotiables: ["Observable rollout"],
    failure_modes: ["underestimated blast radius"],
  },
  {
    id: "risk-controller",
    name: "Risk Controller",
    role: "risk",
    reputation: 0.55,
    bias: "downside-aware",
    non_negotiables: ["Explicit risk acknowledgement"],
    failure_modes: ["missing edge-case analysis"],
  },
  {
    id: "policy-auditor",
    name: "Policy Auditor",
    role: "policy",
    reputation: 0.55,
    bias: "contract-first",
    non_negotiables: ["Policy contract compliance"],
    failure_modes: ["ambiguous requirements"],
  },
];

const PACKS: Record<string, PersonaConfig[]> = {
  default: DEFAULT_PERSONAS,
  "skill-review": SKILL_REVIEW_PERSONAS,
  governance: GOVERNANCE_PERSONAS,
};

export const PERSONA_PACKS = Object.keys(PACKS) as string[];

/**
 * Get personas from a named pack.
 * Returns copies (not references) to prevent mutation.
 */
export function getPersonasByPack(pack: string, count?: number): PersonaConfig[] {
  const personas = PACKS[pack];
  if (!personas) {
    throw new Error(`Unknown persona pack: "${pack}". Available: ${PERSONA_PACKS.join(", ")}`);
  }
  const sliced = count !== undefined ? personas.slice(0, count) : personas;
  return sliced.map((p) => ({ ...p }));
}

/** Type-safe getter for eval packs (default, skill-review) that guarantees systemPrompt/evaluationFocus. */
export function getEvalPersonas(pack: "default" | "skill-review", count?: number): EvalPersonaConfig[] {
  return getPersonasByPack(pack, count) as EvalPersonaConfig[];
}
