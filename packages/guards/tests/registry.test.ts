import { describe, it, expect } from "vitest";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";
import { createGuardEvaluatorRegistry } from "../src/registry.js";

function makeInput(type: string): GuardEvaluateInput {
  return { boardId: "test-board", action: { type, payload: {} } };
}

describe("GuardEvaluatorRegistry", () => {
  it("factory creates registry with 7 built-in types", () => {
    const registry = createGuardEvaluatorRegistry();
    const types = registry.listTypes();
    expect(types).toHaveLength(7);
    expect(types).toContain("send_email");
    expect(types).toContain("code_merge");
    expect(types).toContain("publish");
    expect(types).toContain("support_reply");
    expect(types).toContain("agent_action");
    expect(types).toContain("deployment");
    expect(types).toContain("permission_escalation");
  });

  it("evaluate dispatches to built-in evaluator", () => {
    const registry = createGuardEvaluatorRegistry();
    const votes = registry.evaluate(makeInput("send_email"));
    expect(votes).toHaveLength(1);
    expect(votes[0].evaluator).toBe("email-risk");
  });

  it("evaluate falls back for unknown types", () => {
    const registry = createGuardEvaluatorRegistry();
    const votes = registry.evaluate(makeInput("unknown_type"));
    expect(votes).toHaveLength(1);
    expect(votes[0].evaluator).toBe("generic");
  });

  it("register adds a custom evaluator", () => {
    const registry = createGuardEvaluatorRegistry();
    registry.register("custom_type", () => [
      { evaluator: "custom", vote: "NO", reason: "Custom block", risk: 1 },
    ]);
    expect(registry.listTypes()).toContain("custom_type");
    const votes = registry.evaluate(makeInput("custom_type"));
    expect(votes[0].evaluator).toBe("custom");
  });

  it("custom evaluator overrides built-in", () => {
    const registry = createGuardEvaluatorRegistry();
    registry.register("send_email", () => [
      { evaluator: "override", vote: "NO", reason: "Always block", risk: 1 },
    ]);
    const votes = registry.evaluate(makeInput("send_email"));
    expect(votes[0].evaluator).toBe("override");
  });

  it("get returns undefined for unregistered type", () => {
    const registry = createGuardEvaluatorRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("get returns function for registered type", () => {
    const registry = createGuardEvaluatorRegistry();
    expect(registry.get("send_email")).toBeTypeOf("function");
  });
});
