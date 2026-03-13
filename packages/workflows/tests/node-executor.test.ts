import { describe, it, expect } from "vitest";
import { NodeExecutor, validateWorkflowDefinition } from "../src/node-executor.js";
import type { WorkflowNode, NodeExecIds } from "../src/node-executor.js";
import { createTempStorage } from "./helpers.js";

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
