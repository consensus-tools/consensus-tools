import { generateText } from "ai";
import type { LanguageModelV1 } from "ai";
import type { SkillAgent, SkillProposal } from "./types.js";

/**
 * Generate a SKILL.md improvement proposal via LLM.
 * Returns null if the LLM fails to produce a valid changed document.
 */
export async function proposeImprovement(
  agent: SkillAgent,
  skillName: string,
  currentContent: string,
  previousFeedback: string | null,
  model: LanguageModelV1,
): Promise<SkillProposal | null> {
  const feedbackSection = previousFeedback
    ? `\n\nPREVIOUS FEEDBACK FROM GUARDS (address these concerns):\n${previousFeedback}`
    : "";

  let text: string;
  try {
    const result = await generateText({
      model,
      system: `${agent.systemPrompt}\n\nYou are proposing an improvement to a SKILL.md file used by AI coding agents. Focus on your area of expertise: ${agent.evaluationFocus}.

This document is evaluated by an LLM judge on three dimensions (1-5 scale):
- clarity: Can an agent understand what each command/flag does?
- completeness: Are all arguments, valid values, and behaviors documented? No guessing needed?
- actionability: Can an agent construct correct invocations from this alone?

The document currently scores 4/4/4. Known gaps that prevent a 5:
1. Browse CLI commands ($B goto, $B snapshot, $B fill, $B click, etc.) are used in examples but their flags, arguments, and valid values are never formally defined — the agent must infer from usage
2. External files (qa/templates/qa-report-template.md, qa/references/issue-taxonomy.md) are referenced but no inline fallback if missing
3. Severity levels (Critical/High/Medium/Low) are used for health scoring deductions but never defined — what makes an issue Critical vs High?
4. Console scoring boundary: "10+ errors" overlaps with "4-10 errors" — is exactly 10 in the 40-point or 10-point tier?
5. <SKILL_DIR> placeholder in setup is never resolved to an actual path

Your job: pick ONE gap and close it completely. The improvement should make the document more self-contained so an agent never needs to guess or consult external files.

The MOST IMPORTANT gap is #1 — the browse CLI commands. The judge docks points every time because $B commands are used in examples but never formally documented. If you address this gap, you MUST be accurate. Here are the CORRECT flag definitions from browse/SKILL.md (the authoritative source):
- snapshot: -i (interactive elements only), -c (compact, no empty nodes), -d N (limit tree depth), -a (annotated screenshot with red overlay), -D (unified diff vs previous snapshot), -C (cursor-interactive @c refs), -s <sel> (scope to CSS selector), -o <path> (output path for annotated screenshot)
- console: --clear (reset buffer), --errors (filter to error/warning)
- screenshot: [--viewport] [--clip x,y,w,h] [selector|@ref] [path] — positional args in that order
- cookie-import: <json> is a path to a JSON cookie file (array of {name, value, domain, path} objects)
- js: <expr> — runs JavaScript in page context, returns result as string. Async (await) is supported.
- click/fill: <sel> accepts CSS selectors or @eN element refs from snapshot
- viewport: <WxH> e.g. 375x812, 1280x720

Do NOT invent or hallucinate any flags not listed above. If you're unsure about a flag, omit it.`,
      prompt: `Review this ${skillName} SKILL.md and propose ONE concrete improvement that addresses the most impactful known gap.
${feedbackSection}

Rules:
- Make exactly ONE focused improvement (not a full rewrite)
- Output the FULL improved SKILL.md (not just the diff)
- Keep all existing content — only add, clarify, or reorganize
- Your change must make the document more self-sufficient for an AI agent
- If adding browse command documentation, use ONLY the exact flags listed in the system prompt — do not invent or hallucinate additional flags

Current ${skillName}/SKILL.md:

${currentContent}

Respond in this exact format:

CHANGE_SUMMARY: <one-line description of what you changed and why>
---PROPOSED_CONTENT---
<the full improved SKILL.md content>`,
      maxTokens: 16384,
    });
    text = result.text;
  } catch (err: any) {
    console.error(`  [proposer] LLM error: ${err.message}`);
    return null;
  }

  const summaryMatch = /CHANGE_SUMMARY:\s*(.+)/i.exec(text);
  const contentMatch = /---PROPOSED_CONTENT---\n([\s\S]+)$/i.exec(text);
  const proposedContent = contentMatch?.[1]?.trim();

  // If no proposed content delimiter found, or content is unchanged, skip
  if (!proposedContent || proposedContent === currentContent) {
    console.error(`  [proposer] Failed to parse proposal or content unchanged`);
    return null;
  }

  return {
    agentId: agent.id,
    skillName,
    originalContent: currentContent,
    proposedContent,
    changeSummary: summaryMatch?.[1]?.trim() || "Improvement proposed",
  };
}

/** Deterministic fallback for --dry-run mode */
export function mockProposal(
  agent: SkillAgent,
  skillName: string,
  currentContent: string,
): SkillProposal {
  return {
    agentId: agent.id,
    skillName,
    originalContent: currentContent,
    proposedContent: currentContent + `\n\n<!-- Improved by ${agent.name}: added clarity to ${agent.evaluationFocus} -->`,
    changeSummary: `[mock] ${agent.name} improved ${agent.evaluationFocus} section`,
  };
}
