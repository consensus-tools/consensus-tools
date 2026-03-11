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

export function respawnPersona(personas: AgentPersona[], replaceId?: string): AgentPersona[] {
  if (!replaceId) return personas;
  const available = DEFAULT_PERSONAS.filter((p) => !personas.some((existing) => existing.id === p.id));
  if (available.length === 0) return personas;
  const replacement = available[0]!;
  return personas.map((p) => (p.id === replaceId ? replacement : p));
}
