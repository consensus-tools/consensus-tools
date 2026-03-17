import { describe, test, expect } from "vitest";
import { buildDiffGuardPrompt } from "../src/guard-prompt.js";
import type { AgentPersona } from "../src/personas.js";

const agent: AgentPersona & { reputation: number } = {
  id: "api-accuracy",
  name: "API Accuracy Checker",
  role: "accuracy",
  systemPrompt: "You verify commands and flags.",
  evaluationFocus: "command correctness",
  reputation: 100,
};

const diff = "+Added new section\n-Removed old content";

describe("buildDiffGuardPrompt", () => {
  test("with ground truth includes GROUND TRUTH section", () => {
    const prompt = buildDiffGuardPrompt(agent, diff, "qa/SKILL.md", "ground truth content");
    expect(prompt).toContain("GROUND TRUTH");
    expect(prompt).toContain("ground truth content");
    expect(prompt).toContain("FACTUALLY ACCURATE");
  });

  test("without ground truth reviews for internal consistency", () => {
    const prompt = buildDiffGuardPrompt(agent, diff, "README.md");
    expect(prompt).not.toContain("GROUND TRUTH");
    expect(prompt).toContain("factual accuracy, internal consistency");
  });

  test("includes agent persona", () => {
    const prompt = buildDiffGuardPrompt(agent, diff, "test");
    expect(prompt).toContain("API Accuracy Checker");
    expect(prompt).toContain("command correctness");
  });

  test("includes strict one-line format instruction", () => {
    const prompt = buildDiffGuardPrompt(agent, diff, "test");
    expect(prompt).toContain("Your ENTIRE response must be this single line");
    expect(prompt).toContain("VOTE: YES | RISK: 0.2");
  });

  test("truncates diff to 8000 chars", () => {
    const longDiff = "x".repeat(10000);
    const prompt = buildDiffGuardPrompt(agent, longDiff, "test");
    // Prompt should not contain 10000 x's
    expect(prompt.length).toBeLessThan(10000 + 1000);
  });
});
