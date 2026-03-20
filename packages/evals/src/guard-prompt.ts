import type { AgentPersona } from "./personas.js";

type AgentWithRep = AgentPersona & { reputation: number };

/**
 * Build a diff guard evaluation prompt for a specific agent.
 * The agent evaluates a diff for factual accuracy, optionally against ground truth.
 *
 * @param agent - The evaluating agent with persona and reputation
 * @param diff - The unified diff to evaluate
 * @param skillName - Name/path of the skill being evaluated
 * @param groundTruth - Optional authoritative reference content
 */
export function buildDiffGuardPrompt(
  agent: AgentWithRep,
  diff: string,
  skillName: string,
  groundTruth?: string,
): string {
  const header = `You are ${agent.name} (${agent.role}). ${agent.systemPrompt}

Your focus: ${agent.evaluationFocus}`;

  const diffSection = `DIFF (+ = additions, - = removals):
${diff.slice(0, 8000)}`;

  const rules = `Rules:
- YES: diff is factually accurate and well-structured
- REWRITE: minor inaccuracies (wrong flags, incorrect descriptions, misleading examples)
- NO: serious inaccuracies (fabricated commands, completely wrong behavior, dangerous misinformation)
- Do NOT flag style preferences — only factual issues
- A document can summarize — that's fine. But what it DOES say must be correct.

IMPORTANT: Your ENTIRE response must be this single line and nothing else. No analysis, no explanation, no preamble. Just this one line:
VOTE: YES | RISK: 0.2 | REASON: all commands match ground truth
or
VOTE: REWRITE | RISK: 0.6 | REASON: --flag does not exist in source
or
VOTE: NO | RISK: 0.9 | REASON: fabricated command xyz

Your response (one line only):`;

  if (groundTruth) {
    return `${header}

Check that the diff is FACTUALLY ACCURATE against the ground truth source file. The document should correctly describe commands, flags, workflows, scoring rubrics, and behavior that actually exist in the ground truth.

${diffSection}

GROUND TRUTH (${skillName} — the authoritative reference):
${groundTruth.slice(0, 8000)}

${rules}`;
  }

  return `${header}

Review this diff for factual accuracy, internal consistency, and quality. Check that descriptions match what would be expected, counts are correct, references are valid, and no fabricated information is present.

${diffSection}

${rules}`;
}
