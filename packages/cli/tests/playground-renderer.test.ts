import { describe, it, expect } from "vitest";
import { renderPlaygroundOutput, type PlaygroundResult } from "../src/util/playground-renderer.js";

describe("playground-renderer", () => {
  const safeResult: PlaygroundResult = {
    domain: "code_merge",
    scenarioName: "safe",
    payload: { files: ["src/utils.ts"], diff_summary: "Minor fix", tests_passed: true },
    votes: [
      { evaluator: "security", vote: "YES", reason: "No security concerns", risk: 0.1 },
      { evaluator: "compliance", vote: "YES", reason: "No compliance concerns", risk: 0.1 },
      { evaluator: "user-impact", vote: "YES", reason: "Low user impact", risk: 0.1 },
      { evaluator: "merge-risk", vote: "YES", reason: "No sensitive file touch", risk: 0.25 },
    ],
    hardBlockFlags: [],
    decision: "ALLOW",
    maxRisk: 0.25,
  };

  const blockedResult: PlaygroundResult = {
    domain: "code_merge",
    scenarioName: "risky",
    payload: { diff_summary: "DROP TABLE users", tests_passed: false },
    votes: [
      { evaluator: "security", vote: "NO", reason: "Destructive operation detected", risk: 0.9 },
      { evaluator: "compliance", vote: "YES", reason: "No compliance concerns", risk: 0.1 },
      { evaluator: "user-impact", vote: "YES", reason: "Low user impact", risk: 0.1 },
      { evaluator: "merge-risk", vote: "NO", reason: "Tests failing", risk: 0.9 },
    ],
    hardBlockFlags: [],
    decision: "BLOCK",
    maxRisk: 0.9,
  };

  it("renders output containing domain and scenario name", () => {
    const output = renderPlaygroundOutput(safeResult);
    expect(output).toContain("code_merge");
    expect(output).toContain("safe");
  });

  it("renders all 4 vote rows", () => {
    const output = renderPlaygroundOutput(safeResult);
    expect(output).toContain("security");
    expect(output).toContain("compliance");
    expect(output).toContain("user-impact");
    expect(output).toContain("merge-risk");
  });

  it("renders ALLOW decision", () => {
    const output = renderPlaygroundOutput(safeResult);
    expect(output).toContain("ALLOW");
  });

  it("renders BLOCK decision", () => {
    const output = renderPlaygroundOutput(blockedResult);
    expect(output).toContain("BLOCK");
  });

  it("renders hard-block flags when present", () => {
    const result: PlaygroundResult = {
      ...blockedResult,
      hardBlockFlags: ["WRONGDOING_INSTRUCTION"],
    };
    const output = renderPlaygroundOutput(result);
    expect(output).toContain("WRONGDOING_INSTRUCTION");
  });

  it("renders NONE DETECTED when no hard-block flags", () => {
    const output = renderPlaygroundOutput(safeResult);
    expect(output).toContain("NONE DETECTED");
  });

  it("truncates long reason text", () => {
    const result: PlaygroundResult = {
      ...safeResult,
      votes: [
        { evaluator: "security", vote: "YES", reason: "A".repeat(200), risk: 0.1 },
        ...safeResult.votes.slice(1),
      ],
    };
    const output = renderPlaygroundOutput(result);
    // Should not contain the full 200-char string
    expect(output).not.toContain("A".repeat(200));
  });
});
