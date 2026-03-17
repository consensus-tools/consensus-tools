import type { JudgeScore } from "./types.js";

/** Validate that a parsed score is a number 1-5, defaulting to 2. */
export function validateScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 5) return 2;
  return Math.round(n);
}

/** Validate a parsed JudgeScore object, fixing invalid values. */
export function validateJudgeScore(raw: Record<string, unknown>): JudgeScore {
  return {
    clarity: validateScore(raw.clarity),
    completeness: validateScore(raw.completeness),
    actionability: validateScore(raw.actionability),
    reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "No reasoning provided",
  };
}
