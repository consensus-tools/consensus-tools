import type { AgentPersona } from "./personas.js";

// ─── Types ───────────────────────────────────────────────────────────

export interface Proposal {
  proposerId: string;
  skillName: string;
  originalContent: string;
  proposedContent: string;
  changeSummary: string;
}

export interface ProposerConfig {
  /** Known gaps to include in the system prompt. Domain-specific. */
  knownGaps?: string[];
  /** Authoritative flag/command definitions to prevent hallucination. */
  groundTruthHints?: string;
  /** Max tokens for generation. Default: 16384 */
  maxTokens?: number;
}

/**
 * Callback that calls an LLM and returns the raw text response.
 * This keeps the proposer SDK-agnostic — the caller provides the LLM call.
 */
export type LLMCaller = (systemPrompt: string, userPrompt: string, maxTokens: number) => Promise<string>;

// ─── Prompt Builder ──────────────────────────────────────────────────

export function buildProposerSystemPrompt(
  agent: AgentPersona,
  config?: ProposerConfig,
): string {
  const gaps = config?.knownGaps?.length
    ? `\n\nKnown gaps that prevent a perfect score:\n${config.knownGaps.map((g, i) => `${i + 1}. ${g}`).join("\n")}\n\nYour job: pick ONE gap and close it completely.`
    : "\n\nYour job: identify ONE concrete improvement and make it.";

  const hints = config?.groundTruthHints
    ? `\n\nAUTHORITATIVE REFERENCE (do NOT invent flags/commands not listed here):\n${config.groundTruthHints}`
    : "";

  return `${agent.systemPrompt}

You are proposing an improvement to a SKILL.md file used by AI coding agents. Focus on your area of expertise: ${agent.evaluationFocus}.

This document is evaluated on three dimensions (1-5 scale):
- clarity: Can an agent understand what each command/flag does?
- completeness: Are all arguments, valid values, and behaviors documented?
- actionability: Can an agent construct correct invocations from this alone?
${gaps}${hints}

The improvement should make the document more self-contained so an agent never needs to guess or consult external files.`;
}

export function buildProposerUserPrompt(
  skillName: string,
  currentContent: string,
  previousFeedback: string | null,
): string {
  const feedbackSection = previousFeedback
    ? `\n\nPREVIOUS FEEDBACK FROM GUARDS (address these concerns):\n${previousFeedback}`
    : "";

  return `Review this ${skillName} SKILL.md and propose ONE concrete improvement.
${feedbackSection}

Rules:
- Make exactly ONE focused improvement (not a full rewrite)
- Output the FULL improved SKILL.md (not just the diff)
- Keep all existing content — only add, clarify, or reorganize
- Your change must make the document more self-sufficient for an AI agent
- Do NOT invent or hallucinate any flags, commands, or behavior not in the authoritative reference

Current ${skillName}/SKILL.md:

${currentContent}

Respond in this exact format:

CHANGE_SUMMARY: <one-line description of what you changed and why>
---PROPOSED_CONTENT---
<the full improved SKILL.md content>`;
}

// ─── Proposal Generator ─────────────────────────────────────────────

/**
 * Generate a SKILL.md improvement proposal via LLM.
 * Returns null if the LLM fails to produce a valid changed document.
 *
 * SDK-agnostic: caller provides an LLMCaller function that handles
 * the actual model invocation (Anthropic SDK, OpenAI SDK, Vercel AI, etc.)
 */
export async function proposeImprovement(
  agent: AgentPersona,
  skillName: string,
  currentContent: string,
  callLLM: LLMCaller,
  config?: ProposerConfig,
  previousFeedback?: string | null,
): Promise<Proposal | null> {
  const systemPrompt = buildProposerSystemPrompt(agent, config);
  const userPrompt = buildProposerUserPrompt(skillName, currentContent, previousFeedback ?? null);
  const maxTokens = config?.maxTokens ?? 16384;

  let text: string;
  try {
    text = await callLLM(systemPrompt, userPrompt, maxTokens);
  } catch (err: any) {
    console.error(`  [proposer] LLM error: ${err.message}`);
    return null;
  }

  const summaryMatch = /CHANGE_SUMMARY:\s*(.+)/i.exec(text);
  const contentMatch = /---PROPOSED_CONTENT---\n([\s\S]+)$/i.exec(text);
  const proposedContent = contentMatch?.[1]?.trim();

  if (!proposedContent || proposedContent === currentContent) {
    return null;
  }

  return {
    proposerId: agent.id,
    skillName,
    originalContent: currentContent,
    proposedContent,
    changeSummary: summaryMatch?.[1]?.trim() || "Improvement proposed",
  };
}

// ─── Diff Helper ─────────────────────────────────────────────────────

/** Compute a simple unified diff between two strings (line-level). */
export function computeSimpleDiff(original: string, proposed: string): string {
  const origLines = original.split("\n");
  const propLines = proposed.split("\n");
  const lines: string[] = [];
  const maxLen = Math.max(origLines.length, propLines.length);

  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i];
    const p = propLines[i];
    if (o === p) {
      lines.push(` ${o ?? ""}`);
    } else {
      if (o !== undefined) lines.push(`-${o}`);
      if (p !== undefined) lines.push(`+${p}`);
    }
  }
  return lines.join("\n");
}

// ─── Proposer Selection ──────────────────────────────────────────────

/** Round-robin proposer selection from agent pool. */
export function selectProposer<T extends AgentPersona>(agents: T[], roundIndex: number): T {
  return agents[roundIndex % agents.length]!;
}
