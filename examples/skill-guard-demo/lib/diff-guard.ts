import { generateText } from "ai";
import type { LanguageModelV1 } from "ai";
import type { SkillAgent, GuardVoteResult } from "./types.js";

/**
 * Code-change diff guard: agents review the actual diff of a SKILL.md change
 * against the ground truth source file (browse/SKILL.md) to catch hallucinations,
 * inaccurate flag descriptions, and missing context.
 *
 * Unlike the proposal guards (which evaluate overall quality), this guard
 * specifically checks factual accuracy of the diff.
 */

function buildDiffGuardPrompt(
  agent: SkillAgent,
  diff: string,
  groundTruth: string,
  skillName: string,
): string {
  return `You are ${agent.name} (${agent.role}). ${agent.systemPrompt}

You are reviewing a DIFF to ${skillName}/SKILL.md. Your job is to verify the diff is FACTUALLY ACCURATE by cross-referencing against the ground truth source.

Focus on: ${agent.evaluationFocus}

Check specifically:
- Are command names, flags, and arguments correct per the ground truth?
- Are flag descriptions accurate (not swapped or hallucinated)?
- Are any flags or valid values fabricated (not in the ground truth)?
- Is the change well-scoped and does it introduce any inaccuracies?

DIFF (lines starting with + are additions):
${diff}

GROUND TRUTH (browse/SKILL.md — the authoritative reference):
${groundTruth}

Respond with exactly one line in this format:
VOTE: <YES|NO|REWRITE> | RISK: <0.0-1.0> | REASON: <brief explanation, cite specific inaccuracies if found>`;
}

function parseVote(text: string, agent: SkillAgent): GuardVoteResult {
  const voteMatch = /VOTE:\s*(YES|NO|REWRITE)/i.exec(text);
  const riskMatch = /RISK:\s*([\d.]+)/i.exec(text);
  const reasonMatch = /REASON:\s*(.+)/i.exec(text);

  return {
    evaluator: agent.id,
    vote: (voteMatch?.[1]?.toUpperCase() as "YES" | "NO" | "REWRITE") || "YES",
    risk: Math.min(1, Math.max(0, parseFloat(riskMatch?.[1] || "0.5"))),
    reason: reasonMatch?.[1]?.trim() || `${agent.name}: No issues detected`,
  };
}

export interface DiffGuardResult {
  votes: GuardVoteResult[];
  allPass: boolean;
  issues: string[];
}

export async function runDiffGuards(
  diff: string,
  groundTruth: string,
  skillName: string,
  agents: SkillAgent[],
  model: LanguageModelV1,
): Promise<DiffGuardResult> {
  const votes: GuardVoteResult[] = [];

  for (const agent of agents) {
    try {
      const result = await generateText({
        model,
        temperature: 0.3,
        prompt: buildDiffGuardPrompt(agent, diff, groundTruth, skillName),
        maxTokens: 300,
      });
      votes.push(parseVote(result.text, agent));
    } catch (err: any) {
      votes.push({
        evaluator: agent.id,
        vote: "REWRITE" as const,
        risk: 0.5,
        reason: `${agent.name}: Review failed (${err.message}), flagging for caution`,
      });
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  const issues = votes
    .filter((v) => v.vote !== "YES")
    .map((v) => `${v.evaluator}: ${v.reason}`);

  return {
    votes,
    allPass: issues.length === 0,
    issues,
  };
}
