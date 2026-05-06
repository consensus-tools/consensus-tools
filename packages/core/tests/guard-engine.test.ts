import { describe, it, expect } from "vitest";
import { GuardEngine } from "../src/engine/guard-engine.js";
import { AgentRegistry } from "../src/engine/agent-registry.js";
import { createTempStorage, makeConfig } from "./helpers.js";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";
import { finalDecisionPayloadSchema } from "@consensus-tools/schemas";

function makeGuardInput(overrides: Partial<GuardEvaluateInput> = {}): GuardEvaluateInput {
  return {
    boardId: "board-1",
    agentId: "agent-1",
    action: { type: "agent_action", payload: { message: "hello" } },
    ...overrides,
  };
}

describe("GuardEngine", () => {
  it("returns ALLOW for a simple evaluation", async () => {
    const { storage } = await createTempStorage();
    const engine = new GuardEngine({ storage });
    const result = await engine.evaluate(makeGuardInput());
    expect(result.decision).toBe("ALLOW");
    expect(result.audit_id).toBeDefined();
    expect(result.guard_type).toBe("agent_action");
  });

  it("persists audit events on evaluate", async () => {
    const { storage } = await createTempStorage();
    const engine = new GuardEngine({ storage });
    await engine.evaluate(makeGuardInput());
    const state = await storage.getState();
    const auditTypes = state.audit.map((e) => e.type);
    expect(auditTypes).toContain("PROPOSED_ACTION");
    expect(auditTypes).toContain("FINAL_DECISION");
  });

  it("persists guard result in state.guardResults", async () => {
    const { storage } = await createTempStorage();
    const engine = new GuardEngine({ storage });
    const result = await engine.evaluate(makeGuardInput());
    const state = await storage.getState();
    expect(state.guardResults).toHaveLength(1);
    expect(state.guardResults[0].audit_id).toBe(result.audit_id);
  });

  it("blocks when agent scope check fails", async () => {
    const { storage } = await createTempStorage();
    const agentRegistry = new AgentRegistry(storage);
    await agentRegistry.createAgent({ id: "restricted-1", name: "restricted", kind: "internal", scopes: ["read_only"] });

    const engine = new GuardEngine({ storage, agentRegistry });
    const result = await engine.evaluate(makeGuardInput({ agentId: "restricted-1", action: { type: "send_email", payload: {} } }));
    expect(result.decision).toBe("BLOCK");
    expect(result.risk_score).toBe(1.0);
  });

  it("normalizes unknown guard types to agent_action", async () => {
    const { storage } = await createTempStorage();
    const engine = new GuardEngine({ storage });
    const result = await engine.evaluate(makeGuardInput({ action: { type: "unknown_type", payload: {} } }));
    expect(result.guard_type).toBe("agent_action");
  });

  it("emits FINAL_DECISION audit details with camelCase keys (producer contract)", async () => {
    const { storage } = await createTempStorage();
    const engine = new GuardEngine({ storage });
    await engine.evaluate(makeGuardInput());
    const state = await storage.getState();

    const finalDecisionEvent = state.audit.find((e) => e.type === "FINAL_DECISION");
    expect(finalDecisionEvent).toBeDefined();

    const details = finalDecisionEvent!.details as Record<string, unknown>;
    expect(details).toMatchObject({
      auditId: expect.any(String),
      decision: expect.any(String),
      reason: expect.any(String),
      riskScore: expect.any(Number),
      guardType: expect.any(String),
    });

    // Regression guard: legacy snake_case keys must not appear at this trust boundary
    expect(details).not.toHaveProperty("risk_score");
    expect(details).not.toHaveProperty("guard_type");
    expect(details).not.toHaveProperty("audit_id");
  });

  it("FINAL_DECISION emit validates against Tier-0 finalDecisionPayloadSchema", async () => {
    const { storage } = await createTempStorage();
    const engine = new GuardEngine({ storage });
    await engine.evaluate(makeGuardInput());
    const state = await storage.getState();

    const finalDecisionEvent = state.audit.find((e) => e.type === "FINAL_DECISION");
    const result = finalDecisionPayloadSchema.safeParse(finalDecisionEvent!.details);
    expect(result.success).toBe(true);
  });
});
