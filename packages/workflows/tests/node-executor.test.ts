import { describe, it, expect } from "vitest";
import { NodeExecutor, validateWorkflowDefinition } from "../src/node-executor.js";
import type { WorkflowNode, NodeExecIds } from "../src/node-executor.js";
import { createTempStorage } from "./helpers.js";
import { newId, nowIso } from "@consensus-tools/core";
import { finalDecisionPayloadSchema } from "@consensus-tools/schemas";

const ids: NodeExecIds = { boardId: "board-1", runId: "run-1", workflowId: "wf-1" };

describe("NodeExecutor", () => {
  it("throws for unknown node type", async () => {
    const { storage } = await createTempStorage();
    const executor = new NodeExecutor({ storage });
    const node = { id: "n1", type: "bogus" as any, config: {} };
    await expect(executor.execute(node, {}, ids)).rejects.toThrow("Unknown workflow node type: bogus");
  });

  it("executes a trigger node with manual source", async () => {
    const { storage } = await createTempStorage();
    const executor = new NodeExecutor({ storage });
    const node: WorkflowNode = { id: "t1", type: "trigger", config: { source: "manual" } };
    const result = await executor.execute(node, {}, ids);
    expect(result.ok).toBe(true);
    expect(result.trigger).toBe("manual");
  });

  it("executes an action node", async () => {
    const { storage } = await createTempStorage();
    const executor = new NodeExecutor({ storage });
    const node: WorkflowNode = { id: "a1", type: "action", config: { action: "log", message: "test" } };
    const result = await executor.execute(node, {}, ids);
    expect(result).toBeDefined();
  });

  it("requireFinalHumanApprovalYes aborts when no human decision is present (fail closed)", async () => {
    const { storage } = await createTempStorage();
    const executor = new NodeExecutor({ storage });
    const node: WorkflowNode = { id: "a1", type: "action", config: { action: "log", message: "x", requireFinalHumanApprovalYes: true } };
    // No hitlDecision in context — an explicit "require a human YES" node must NOT run.
    const result = await executor.execute(node, {}, ids);
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it("requireFinalHumanApprovalYes aborts on a NO decision", async () => {
    const { storage } = await createTempStorage();
    const executor = new NodeExecutor({ storage });
    const node: WorkflowNode = { id: "a1", type: "action", config: { action: "log", message: "x", requireFinalHumanApprovalYes: true } };
    const result = await executor.execute(node, { hitlDecision: "NO" }, ids);
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it("requireFinalHumanApprovalYes proceeds on an explicit YES", async () => {
    const { storage } = await createTempStorage();
    const executor = new NodeExecutor({ storage });
    const node: WorkflowNode = { id: "a1", type: "action", config: { action: "log", message: "x", requireFinalHumanApprovalYes: true } };
    const result = await executor.execute(node, { hitlDecision: "YES" }, ids);
    expect(result.ok).not.toBe(false);
  });

  it("emits FINAL_DECISION audit details with camelCase keys (producer contract)", async () => {
    const { storage } = await createTempStorage();
    const executor = new NodeExecutor({ storage });

    // Seed AGENT_VERDICT events so the guard node's resolution path runs
    await storage.update((s) => {
      const at = nowIso();
      s.audit.push({
        id: newId("audit"),
        at,
        type: "AGENT_VERDICT",
        details: {
          runId: ids.runId,
          evaluator: "security",
          verdict: "YES",
          risk: 0.2,
          reason: "ok",
          weight: 1,
          reputation: 100,
        },
      });
      s.audit.push({
        id: newId("audit"),
        at,
        type: "AGENT_VERDICT",
        details: {
          runId: ids.runId,
          evaluator: "compliance",
          verdict: "YES",
          risk: 0.3,
          reason: "ok",
          weight: 1,
          reputation: 100,
        },
      });
    });

    const guardNode: WorkflowNode = {
      id: "g1",
      type: "guard",
      config: { guardType: "code_merge", quorum: 0.5, riskThreshold: 0.7 },
    };
    await executor.execute(guardNode, {}, ids);

    const state = await storage.getState();
    const finalDecisionEvent = state.audit.find((e) => e.type === "FINAL_DECISION");
    expect(finalDecisionEvent).toBeDefined();

    const details = finalDecisionEvent!.details as Record<string, unknown>;
    // Canonical camelCase shape (matches GuardEngine emit at packages/core/src/engine/guard-engine.ts:111)
    expect(details).toMatchObject({
      runId: ids.runId,
      boardId: ids.boardId,
      decision: expect.any(String),
      reason: expect.any(String),
      riskScore: expect.any(Number),
      guardType: expect.any(String),
      consensusMeta: expect.objectContaining({
        quorumMet: expect.any(Boolean),
        weightedYesRatio: expect.any(Number),
        voterCount: expect.any(Number),
      }),
    });

    // Regression guard: legacy snake_case keys must be absent at this trust boundary
    expect(details).not.toHaveProperty("risk_score");
    expect(details).not.toHaveProperty("guard_type");
    expect(details).not.toHaveProperty("consensus_meta");

    // Validates against Tier-0 schema (catches drift if any field gets re-added under wrong name)
    expect(finalDecisionPayloadSchema.safeParse(details).success).toBe(true);
  });
});

describe("validateWorkflowDefinition", () => {
  it("rejects missing nodes", () => {
    const result = validateWorkflowDefinition({});
    expect(result.valid).toBe(false);
  });

  it("rejects invalid node type", () => {
    const result = validateWorkflowDefinition({ nodes: [{ id: "n1", type: "invalid" }] });
    expect(result.valid).toBe(false);
  });

  it("accepts valid definition", () => {
    const result = validateWorkflowDefinition({
      nodes: [
        { id: "t1", type: "trigger", config: { source: "manual" } },
        { id: "g1", type: "guard", config: {} },
      ],
    });
    expect(result.valid).toBe(true);
  });

  it("accepts guard nodes with config", () => {
    const result = validateWorkflowDefinition({
      nodes: [{ id: "g1", type: "guard", config: { quorum: 0.8, riskThreshold: 0.7 } }],
    });
    expect(result.valid).toBe(true);
  });
});
