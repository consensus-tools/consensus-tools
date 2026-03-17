export interface AgentPersona {
  id: string;
  name: string;
  role: string;
  systemPrompt: string;
  evaluationFocus: string;
}

const DEFAULT_PERSONAS: AgentPersona[] = [
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

export function generatePersonas(count: number = 3): AgentPersona[] {
  return DEFAULT_PERSONAS.slice(0, count);
}

// ─── Skill-review personas (5 specialists for SKILL.md evaluation) ───

const SKILL_REVIEW_PERSONAS: AgentPersona[] = [
  {
    id: "doc-architect",
    name: "Doc Architect",
    role: "structure",
    systemPrompt:
      "You evaluate documents for logical structure, heading hierarchy, information flow, and progressive disclosure.",
    evaluationFocus:
      "document structure, heading hierarchy, progressive disclosure, section ordering",
  },
  {
    id: "api-accuracy",
    name: "API Accuracy Checker",
    role: "accuracy",
    systemPrompt:
      "You verify that every command, flag, and argument is correctly documented with valid values and types.",
    evaluationFocus:
      "command names, flags, arguments, return values match ground truth exactly",
  },
  {
    id: "agent-usability",
    name: "Agent Usability Tester",
    role: "usability",
    systemPrompt:
      "You read documents from the perspective of an AI agent that must use the tool without human help.",
    evaluationFocus:
      "can an AI agent execute the full task from this doc alone? zero-guess invocations?",
  },
  {
    id: "completeness-auditor",
    name: "Completeness Auditor",
    role: "completeness",
    systemPrompt:
      "You check for missing commands, undocumented edge cases, error handling gaps, and uncovered scenarios.",
    evaluationFocus:
      "missing commands, undocumented edge cases, gaps in scoring rubrics or decision criteria",
  },
  {
    id: "style-guardian",
    name: "Style Guardian",
    role: "style",
    systemPrompt:
      "You enforce formatting consistency: uniform heading levels, consistent command synopsis format, aligned tables, proper markdown syntax.",
    evaluationFocus:
      "consistent markdown formatting, table alignment, code block tags, cross-skill template compliance",
  },
];

/** Return the 5 skill-review specialist personas for SKILL.md evaluation. */
export function generateSkillReviewPersonas(): AgentPersona[] {
  return SKILL_REVIEW_PERSONAS.map((p) => ({ ...p }));
}

export function respawnPersona(personas: AgentPersona[], replaceId?: string): AgentPersona[] {
  if (!replaceId) return personas;
  const available = DEFAULT_PERSONAS.filter((p) => !personas.some((existing) => existing.id === p.id));
  if (available.length === 0) return personas;
  const replacement = available[0]!;
  return personas.map((p) => (p.id === replaceId ? replacement : p));
}
