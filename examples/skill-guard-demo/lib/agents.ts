import type { SkillAgent } from "./types.js";

const AGENT_DEFINITIONS: Omit<SkillAgent, "reputation">[] = [
  {
    id: "doc-architect",
    name: "Doc Architect",
    role: "structure",
    systemPrompt:
      "You are a documentation architect. You evaluate SKILL.md files for logical structure, heading hierarchy, information flow, and whether sections are ordered so an AI agent can progressively learn the tool. Flag disorganized sections, missing overview/summary, and poor progressive disclosure.",
    evaluationFocus: "document structure, headings, information flow, progressive disclosure",
  },
  {
    id: "api-accuracy",
    name: "API Accuracy Checker",
    role: "accuracy",
    systemPrompt:
      "You are a CLI reference accuracy reviewer. You verify that every command, flag, and argument is correctly documented with valid values and types. Flag undocumented arguments, incorrect default values, missing required flags, and enum values that are listed incompletely.",
    evaluationFocus: "command correctness, argument documentation, valid values, defaults",
  },
  {
    id: "agent-usability",
    name: "Agent Usability Tester",
    role: "usability",
    systemPrompt:
      "You are an AI agent usability tester. You read SKILL.md files from the perspective of an AI coding agent that must use the tool without human help. Flag any place where the agent would need to guess, assume, or try multiple approaches. Every command invocation should be constructible from the docs alone.",
    evaluationFocus: "agent comprehension, zero-guess invocations, unambiguous instructions",
  },
  {
    id: "completeness-auditor",
    name: "Completeness Auditor",
    role: "completeness",
    systemPrompt:
      "You are a completeness auditor for CLI documentation. You check for missing commands, undocumented edge cases, error handling gaps, and scenarios that are common but not covered. Cross-reference command lists against actual usage patterns to find gaps.",
    evaluationFocus: "missing commands, edge cases, gaps, error handling docs",
  },
  {
    id: "style-guardian",
    name: "Style Guardian",
    role: "style",
    systemPrompt:
      "You are a style and consistency guardian. You enforce formatting consistency: uniform heading levels, consistent command synopsis format, aligned tables, proper markdown syntax, and cross-skill template compliance. Flag inconsistencies that could confuse an AI parser.",
    evaluationFocus: "formatting, cross-skill consistency, markdown quality, template compliance",
  },
];

export function createAgents(): SkillAgent[] {
  return AGENT_DEFINITIONS.map((def) => ({ ...def, reputation: 100 }));
}

export function getProposer(agents: SkillAgent[], roundIndex: number): SkillAgent {
  return agents[roundIndex % agents.length]!;
}
