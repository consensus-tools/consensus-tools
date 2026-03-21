import { describe, it, expect } from "vitest";
import { createGuardTools, createGuardTool } from "../src/tools.js";
import { createGuardTemplate } from "@consensus-tools/guards";

describe("createGuardTool", () => {
  it("creates a LangChain-compatible tool for a guard domain", () => {
    const tool = createGuardTool("code_merge");
    expect(tool.name).toBe("consensus_guard_code_merge");
    expect(tool.description).toContain("code merge");
    expect(tool.schema).toBeTruthy();
  });

  it("tool.invoke() calls the guard evaluator and returns a decision", async () => {
    const tool = createGuardTool("agent_action");
    const result = await tool.invoke({
      payload: { irreversible: false },
    });
    const parsed = JSON.parse(result);
    expect(parsed.decision).toBe("ALLOW");
    expect(parsed.votes).toBeTruthy();
  });

  it("tool.invoke() returns BLOCK for high-risk input", async () => {
    const tool = createGuardTool("agent_action");
    const result = await tool.invoke({
      payload: { irreversible: true },
    });
    const parsed = JSON.parse(result);
    expect(parsed.decision).toBe("BLOCK");
  });
});

describe("createGuardTools", () => {
  it("creates tools for all 7 built-in guard domains", () => {
    const tools = createGuardTools();
    expect(tools).toHaveLength(7);
    expect(tools.map(t => t.name)).toContain("consensus_guard_code_merge");
    expect(tools.map(t => t.name)).toContain("consensus_guard_send_email");
    expect(tools.map(t => t.name)).toContain("consensus_guard_publish");
  });

  it("creates tools for specific domains only", () => {
    const tools = createGuardTools(["code_merge", "publish"]);
    expect(tools).toHaveLength(2);
  });

  it("includes custom guard templates", () => {
    const custom = createGuardTemplate("loan_approval", {
      rules: () => [{ evaluator: "loan", vote: "YES", reason: "OK", risk: 0.1 }],
    });
    const tools = createGuardTools(undefined, [custom]);
    expect(tools.length).toBeGreaterThan(7);
    expect(tools.map(t => t.name)).toContain("consensus_guard_loan_approval");
  });

  it("createGuardTools([]) returns empty array", () => {
    const tools = createGuardTools([]);
    expect(tools).toHaveLength(0);
  });
});

describe("createGuardTool with custom description", () => {
  it("createGuardTool with custom description uses it", () => {
    const tool = createGuardTool("publish", "My custom description for publish guard");
    expect(tool.description).toBe("My custom description for publish guard");
  });
});
