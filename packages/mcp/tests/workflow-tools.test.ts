import { describe, it, expect, beforeEach, vi } from "vitest";
import { handle } from "../src/tools/workflow-tools.js";
import { makeMockCtx, parseContent } from "./helpers.js";
import type { McpContext } from "../src/context.js";

let ctx: McpContext;

beforeEach(() => {
  ctx = makeMockCtx({
    workflowRunner: {
      createWorkflow: vi.fn().mockResolvedValue({ id: "wf-1", name: "Test WF" }),
      listWorkflows: vi.fn().mockResolvedValue([]),
      run: vi.fn().mockResolvedValue({ id: "run-1", status: "running" }),
    } as any,
    cronScheduler: {
      register: vi.fn().mockResolvedValue({ id: "cron-1", cronExpression: "*/5 * * * *" }),
      list: vi.fn().mockResolvedValue([]),
    } as any,
  });
});

describe("workflow tools", () => {
  it("workflow.create calls workflowRunner.createWorkflow", async () => {
    const result = await handle("workflow.create", {
      name: "My WF", definition: { steps: [] },
    }, ctx);
    expect(ctx.workflowRunner!.createWorkflow).toHaveBeenCalledWith("My WF", { steps: [] }, undefined);
    const data = parseContent(result);
    expect(data.id).toBe("wf-1");
  });

  it("workflow.run calls workflowRunner.run", async () => {
    const result = await handle("workflow.run", { workflowId: "wf-1" }, ctx);
    expect(ctx.workflowRunner!.run).toHaveBeenCalledWith("wf-1");
    const data = parseContent(result);
    expect(data.status).toBe("running");
  });

  it("workflow.list calls workflowRunner.listWorkflows", async () => {
    const result = await handle("workflow.list", {}, ctx);
    expect(ctx.workflowRunner!.listWorkflows).toHaveBeenCalled();
    const data = parseContent(result);
    expect(data.workflows).toEqual([]);
  });

  it("cron.register calls cronScheduler.register", async () => {
    const result = await handle("cron.register", {
      workflowId: "wf-1", cronExpression: "*/5 * * * *",
    }, ctx);
    expect(ctx.cronScheduler!.register).toHaveBeenCalledWith("wf-1", "*/5 * * * *");
    const data = parseContent(result);
    expect(data.id).toBe("cron-1");
  });

  it("cron.list calls cronScheduler.list", async () => {
    const result = await handle("cron.list", {}, ctx);
    expect(ctx.cronScheduler!.list).toHaveBeenCalled();
  });

  it("returns isError when workflowRunner is undefined", async () => {
    ctx.workflowRunner = undefined;
    const result = await handle("workflow.create", { name: "X", definition: {} }, ctx);
    expect((result as any).isError).toBe(true);
    const data = parseContent(result);
    expect(data.error).toContain("not configured");
  });

  it("returns isError when cronScheduler is undefined", async () => {
    ctx.cronScheduler = undefined;
    const result = await handle("cron.register", { workflowId: "wf-1", cronExpression: "* * * * *" }, ctx);
    expect((result as any).isError).toBe(true);
    const data = parseContent(result);
    expect(data.error).toContain("not configured");
  });

  it("unknown tool returns isError", async () => {
    const result = await handle("workflow.unknown", {}, ctx);
    expect((result as any).isError).toBe(true);
  });
});
