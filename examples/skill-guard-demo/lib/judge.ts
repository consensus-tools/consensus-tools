import { generateText } from "ai";
import type { LanguageModelV1 } from "ai";
import { validateScore, validateJudgeScore } from "@consensus-tools/evals";
import type { JudgeScore } from "./types.js";

// Re-export for backwards compatibility with other demo files
export { validateScore, validateJudgeScore };

const FAIL_SAFE_SCORE: JudgeScore = {
  clarity: 2,
  completeness: 2,
  actionability: 2,
  reasoning: "Judge unavailable — using fail-safe scores",
};

/**
 * LLM-as-judge scorer for SKILL.md quality.
 * Ported from consensus-gstack-evals/test/helpers/llm-judge.ts
 *
 * Returns fail-safe scores {2,2,2} on any error (API failure, malformed JSON, NaN scores).
 */
export async function judgeSkillQuality(
  skillName: string,
  content: string,
  model: LanguageModelV1,
): Promise<JudgeScore> {
  try {
    const result = await generateText({
      model,
      temperature: 0.7,
      prompt: `You are evaluating a SKILL.md document that an AI coding agent reads to learn how to perform a task autonomously. The document may be a CLI reference, a workflow guide, or a combination — evaluate it for what it is.

The agent must be able to read this document and then execute the described task without human help. It needs to:
1. Understand the overall workflow, phases, and decision points
2. Know what tools/commands to use at each step, with correct syntax
3. Handle edge cases, errors, and conditional branches without guessing
4. Produce the expected deliverables (reports, scores, commits, etc.)

Rate the following ${skillName}/SKILL.md on three dimensions (1-5 scale):

- **clarity** (1-5): Can an agent follow the document's instructions without ambiguity? Are phases, decision trees, and conditional logic unambiguous?
- **completeness** (1-5): Is everything the agent needs contained in this document or explicitly referenced? Are all commands documented with their flags and valid values? Are scoring rubrics, severity definitions, and output formats fully specified? Would the agent ever need to guess?
- **actionability** (1-5): Can an agent execute the full task end-to-end from this document alone? Can it construct every command invocation, compute every score, and produce every deliverable without external help?

Scoring guide:
- 5: Excellent — an agent could execute the entire task without any inference, guessing, or external references. Every command, flag, scoring formula, and decision criterion is explicitly defined.
- 4: Good — minor gaps an experienced agent could infer from context, but a strict agent following instructions literally would occasionally get stuck.
- 3: Adequate — significant guessing required for some steps. Commands are shown in examples but not formally documented. Some scoring criteria or decision points are undefined.
- 2: Poor — agent would fail on multiple steps without external help.
- 1: Unusable — agent cannot execute the task from this document.

Respond with ONLY valid JSON in this exact format:
{"clarity": N, "completeness": N, "actionability": N, "reasoning": "brief explanation"}

Here is the ${skillName}/SKILL.md to evaluate:

${content}`,
      maxTokens: 1024,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`  [judge] Non-JSON response: ${result.text.slice(0, 200)}`);
      return { ...FAIL_SAFE_SCORE };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return validateJudgeScore(parsed);
  } catch (err: any) {
    console.error(`  [judge] Error: ${err.message}`);
    return { ...FAIL_SAFE_SCORE };
  }
}

/** Check if all judge dimensions pass threshold */
export function judgePasses(scores: JudgeScore, threshold = 4): boolean {
  return scores.clarity >= threshold && scores.completeness >= threshold && scores.actionability >= threshold;
}

/** Deterministic fallback for --dry-run mode */
export function mockJudgeScores(round: number): JudgeScore {
  const base = Math.min(3 + round, 5);
  return {
    clarity: base,
    completeness: Math.max(base - 1, 3),
    actionability: base,
    reasoning: `[mock] Round ${round} shows ${round > 1 ? "improvement" : "baseline quality"}`,
  };
}
