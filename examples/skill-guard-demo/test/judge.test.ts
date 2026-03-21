import { describe, it, expect } from "vitest";
import { validateScore, validateJudgeScore, judgePasses } from "../lib/judge.js";

describe("validateScore", () => {
  it("accepts valid integer scores", () => {
    expect(validateScore(1)).toBe(1);
    expect(validateScore(3)).toBe(3);
    expect(validateScore(5)).toBe(5);
  });

  it("rounds float scores", () => {
    expect(validateScore(3.7)).toBe(4);
    expect(validateScore(4.2)).toBe(4);
  });

  it("defaults to 2 for scores below 1", () => {
    expect(validateScore(0)).toBe(2);
    expect(validateScore(-1)).toBe(2);
  });

  it("defaults to 2 for scores above 5", () => {
    expect(validateScore(6)).toBe(2);
    expect(validateScore(100)).toBe(2);
  });

  it("defaults to 2 for NaN", () => {
    expect(validateScore(NaN)).toBe(2);
  });

  it("defaults to 2 for non-numeric strings", () => {
    expect(validateScore("four")).toBe(2);
    expect(validateScore("")).toBe(2);
  });

  it("converts numeric strings to numbers", () => {
    expect(validateScore("4")).toBe(4);
    expect(validateScore("3.5")).toBe(4);
  });

  it("defaults to 2 for null/undefined", () => {
    expect(validateScore(null)).toBe(2);
    expect(validateScore(undefined)).toBe(2);
  });

  it("defaults to 2 for Infinity", () => {
    expect(validateScore(Infinity)).toBe(2);
    expect(validateScore(-Infinity)).toBe(2);
  });
});

describe("validateJudgeScore", () => {
  it("passes through valid scores", () => {
    const result = validateJudgeScore({ clarity: 4, completeness: 3, actionability: 5, reasoning: "good" });
    expect(result).toEqual({ clarity: 4, completeness: 3, actionability: 5, reasoning: "good" });
  });

  it("fixes invalid scores to 2", () => {
    const result = validateJudgeScore({ clarity: "bad", completeness: NaN, actionability: 0, reasoning: "hmm" });
    expect(result.clarity).toBe(2);
    expect(result.completeness).toBe(2);
    expect(result.actionability).toBe(2);
  });

  it("handles missing fields", () => {
    const result = validateJudgeScore({});
    expect(result.clarity).toBe(2);
    expect(result.completeness).toBe(2);
    expect(result.actionability).toBe(2);
    expect(result.reasoning).toBe("No reasoning provided");
  });

  it("handles non-string reasoning", () => {
    const result = validateJudgeScore({ clarity: 4, completeness: 4, actionability: 4, reasoning: 42 });
    expect(result.reasoning).toBe("No reasoning provided");
  });
});

describe("judgePasses", () => {
  it("passes when all scores >= 4", () => {
    expect(judgePasses({ clarity: 4, completeness: 4, actionability: 4, reasoning: "" })).toBe(true);
    expect(judgePasses({ clarity: 5, completeness: 5, actionability: 5, reasoning: "" })).toBe(true);
  });

  it("fails when any score < 4", () => {
    expect(judgePasses({ clarity: 3, completeness: 4, actionability: 4, reasoning: "" })).toBe(false);
    expect(judgePasses({ clarity: 4, completeness: 3, actionability: 4, reasoning: "" })).toBe(false);
    expect(judgePasses({ clarity: 4, completeness: 4, actionability: 3, reasoning: "" })).toBe(false);
  });

  it("supports custom threshold", () => {
    expect(judgePasses({ clarity: 3, completeness: 3, actionability: 3, reasoning: "" }, 3)).toBe(true);
    expect(judgePasses({ clarity: 2, completeness: 3, actionability: 3, reasoning: "" }, 3)).toBe(false);
  });

  it("fails for fail-safe scores {2,2,2}", () => {
    expect(judgePasses({ clarity: 2, completeness: 2, actionability: 2, reasoning: "fail-safe" })).toBe(false);
  });
});
