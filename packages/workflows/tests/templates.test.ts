import { describe, it, expect } from "vitest";
import { prMergeGuardTemplate } from "../src/templates/pr-merge-guard.js";
import { linearTaskDecompTemplate } from "../src/templates/linear-task-decomp.js";
import { cronAutoAssignTemplate } from "../src/templates/cron-auto-assign.js";

describe("Built-in templates", () => {
  it("prMergeGuardTemplate has correct structure", () => {
    expect(prMergeGuardTemplate.id).toBeDefined();
    expect(prMergeGuardTemplate.name).toBeDefined();
    expect(prMergeGuardTemplate.steps).toEqual(["fetch_pr", "evaluate_guard", "hitl_approval", "merge_action"]);
    expect(typeof prMergeGuardTemplate.handler).toBe("function");
  });

  it("linearTaskDecompTemplate has correct structure", () => {
    expect(linearTaskDecompTemplate.id).toBeDefined();
    expect(linearTaskDecompTemplate.name).toBeDefined();
    expect(linearTaskDecompTemplate.steps).toEqual(["fetch_tasks", "evaluate_agents", "hitl_approval", "create_subtasks"]);
    expect(typeof linearTaskDecompTemplate.handler).toBe("function");
  });

  it("cronAutoAssignTemplate has correct structure", () => {
    expect(cronAutoAssignTemplate.id).toBeDefined();
    expect(cronAutoAssignTemplate.name).toBeDefined();
    expect(cronAutoAssignTemplate.steps).toEqual(["fetch_unassigned", "evaluate_agents", "guard_check", "auto_assign"]);
    expect(typeof cronAutoAssignTemplate.handler).toBe("function");
  });

  it("prMergeGuardTemplate fetch_pr step completes", async () => {
    const result = await prMergeGuardTemplate.handler("fetch_pr", {
      workflowId: "wf-1",
      runId: "run-1",
      definition: { repo: "test/repo", prNumber: 42 },
      storage: {} as any,
      cursor: {},
    });
    expect(result.status).toBe("completed");
  });

  it("prMergeGuardTemplate hitl_approval step waits when no cursor", async () => {
    const result = await prMergeGuardTemplate.handler("hitl_approval", {
      workflowId: "wf-1",
      runId: "run-1",
      definition: {},
      storage: {} as any,
      cursor: {},
    });
    expect(result.status).toBe("waiting");
  });
});
