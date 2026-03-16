import { describe, it, expect } from "vitest";
import { validateScore, validateJudgeScore } from "../src/validation.js";

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

  it("converts numeric strings", () => {
    expect(validateScore("4")).toBe(4);
    expect(validateScore("3.5")).toBe(4);
  });

  it("defaults to 2 for non-numeric", () => {
    expect(validateScore("four")).toBe(2);
    expect(validateScore("")).toBe(2);
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
