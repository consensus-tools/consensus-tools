import { describe, test, expect } from "vitest";
import {
  buildProposerSystemPrompt,
  buildProposerUserPrompt,
  proposeImprovement,
  computeSimpleDiff,
  selectProposer,
} from "../src/proposer.js";
import type { AgentPersona } from "../src/personas.js";

const testAgent: AgentPersona = {
  id: "test-agent",
  name: "Test Agent",
  role: "testing",
  systemPrompt: "You are a test agent.",
  evaluationFocus: "testing accuracy",
};

describe("buildProposerSystemPrompt", () => {
  test("includes agent persona and evaluation focus", () => {
    const prompt = buildProposerSystemPrompt(testAgent);
    expect(prompt).toContain("You are a test agent.");
    expect(prompt).toContain("testing accuracy");
    expect(prompt).toContain("clarity");
    expect(prompt).toContain("completeness");
    expect(prompt).toContain("actionability");
  });

  test("includes known gaps when provided", () => {
    const prompt = buildProposerSystemPrompt(testAgent, {
      knownGaps: ["Missing command docs", "No error handling"],
    });
    expect(prompt).toContain("1. Missing command docs");
    expect(prompt).toContain("2. No error handling");
    expect(prompt).toContain("pick ONE gap");
  });

  test("includes ground truth hints when provided", () => {
    const prompt = buildProposerSystemPrompt(testAgent, {
      groundTruthHints: "snapshot: -i (interactive), -a (annotated)",
    });
    expect(prompt).toContain("AUTHORITATIVE REFERENCE");
    expect(prompt).toContain("snapshot: -i (interactive)");
    expect(prompt).toContain("do NOT invent");
  });
});

describe("buildProposerUserPrompt", () => {
  test("includes skill content", () => {
    const prompt = buildProposerUserPrompt("qa", "# QA Skill\nDo testing.", null);
    expect(prompt).toContain("qa SKILL.md");
    expect(prompt).toContain("# QA Skill");
    expect(prompt).toContain("CHANGE_SUMMARY");
    expect(prompt).toContain("---PROPOSED_CONTENT---");
  });

  test("includes feedback when provided", () => {
    const prompt = buildProposerUserPrompt("qa", "content", "Fix the typo on line 3");
    expect(prompt).toContain("PREVIOUS FEEDBACK FROM GUARDS");
    expect(prompt).toContain("Fix the typo on line 3");
  });

  test("no feedback section when null", () => {
    const prompt = buildProposerUserPrompt("qa", "content", null);
    expect(prompt).not.toContain("PREVIOUS FEEDBACK");
  });
});

describe("proposeImprovement", () => {
  test("parses valid LLM response", async () => {
    const mockLLM = async () =>
      "CHANGE_SUMMARY: Added severity definitions\n---PROPOSED_CONTENT---\n# QA Skill\nDo testing.\n\n## Severity\n- Critical: breaks core flow";

    const result = await proposeImprovement(testAgent, "qa", "# QA Skill\nDo testing.", mockLLM);
    expect(result).not.toBeNull();
    expect(result!.changeSummary).toBe("Added severity definitions");
    expect(result!.proposedContent).toContain("## Severity");
    expect(result!.proposerId).toBe("test-agent");
  });

  test("returns null for unchanged content", async () => {
    const content = "# QA Skill\nDo testing.";
    const mockLLM = async () => `CHANGE_SUMMARY: nothing\n---PROPOSED_CONTENT---\n${content}`;
    const result = await proposeImprovement(testAgent, "qa", content, mockLLM);
    expect(result).toBeNull();
  });

  test("returns null on LLM error", async () => {
    const mockLLM = async () => { throw new Error("rate limited"); };
    const result = await proposeImprovement(testAgent, "qa", "content", mockLLM);
    expect(result).toBeNull();
  });

  test("returns null for unparseable response", async () => {
    const mockLLM = async () => "Here is my analysis of the document...";
    const result = await proposeImprovement(testAgent, "qa", "content", mockLLM);
    expect(result).toBeNull();
  });
});

describe("computeSimpleDiff", () => {
  test("shows additions and deletions", () => {
    const diff = computeSimpleDiff("line1\nline2\nline3", "line1\nchanged\nline3\nline4");
    expect(diff).toContain("-line2");
    expect(diff).toContain("+changed");
    expect(diff).toContain("+line4");
    expect(diff).toContain(" line1");
    expect(diff).toContain(" line3");
  });

  test("identical content shows no changes", () => {
    const diff = computeSimpleDiff("same\ncontent", "same\ncontent");
    expect(diff).not.toContain("+");
    expect(diff).not.toContain("-");
  });
});

describe("selectProposer", () => {
  const agents = [
    { ...testAgent, id: "a" },
    { ...testAgent, id: "b" },
    { ...testAgent, id: "c" },
  ];

  test("round-robin selection", () => {
    expect(selectProposer(agents, 0).id).toBe("a");
    expect(selectProposer(agents, 1).id).toBe("b");
    expect(selectProposer(agents, 2).id).toBe("c");
    expect(selectProposer(agents, 3).id).toBe("a");
  });
});
