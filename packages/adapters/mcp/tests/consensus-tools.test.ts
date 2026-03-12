import { describe, it, expect, beforeEach } from "vitest";
import { handle } from "../src/tools/consensus-tools.js";
import { makeMockCtx, parseContent } from "./helpers.js";
import type { McpContext } from "../src/context.js";

let ctx: McpContext;

beforeEach(() => {
  ctx = makeMockCtx();
});

describe("consensus tools", () => {
  it("consensus_post_job calls engine.postJob", async () => {
    const result = await handle("consensus_post_job", { title: "Test", description: "Desc" }, ctx);
    expect(ctx.engine.postJob).toHaveBeenCalledWith("test-agent", expect.objectContaining({ title: "Test" }));
    const data = parseContent(result);
    expect(data.id).toBe("job-1");
  });

  it("consensus_list_jobs passes filters", async () => {
    await handle("consensus_list_jobs", { status: "open", tag: "urgent" }, ctx);
    expect(ctx.engine.listJobs).toHaveBeenCalledWith({ status: "open", tag: "urgent" });
  });

  it("consensus_submit calls engine.submitJob with defaults", async () => {
    await handle("consensus_submit", { jobId: "j1" }, ctx);
    expect(ctx.engine.submitJob).toHaveBeenCalledWith("test-agent", "j1", {
      summary: "",
      artifacts: {},
      confidence: 0.5,
    });
  });

  it("consensus_submit uses provided values", async () => {
    await handle("consensus_submit", {
      jobId: "j1", summary: "Done", artifacts: { file: "test.ts" }, confidence: 0.9,
    }, ctx);
    expect(ctx.engine.submitJob).toHaveBeenCalledWith("test-agent", "j1", {
      summary: "Done",
      artifacts: { file: "test.ts" },
      confidence: 0.9,
    });
  });

  it("consensus_vote calls engine.vote", async () => {
    await handle("consensus_vote", { jobId: "j1", score: 5, rationale: "Good" }, ctx);
    expect(ctx.engine.vote).toHaveBeenCalledWith("test-agent", "j1", expect.objectContaining({ score: 5 }));
  });

  it("consensus_status calls engine.getStatus", async () => {
    await handle("consensus_status", { jobId: "j1" }, ctx);
    expect(ctx.engine.getStatus).toHaveBeenCalledWith("j1");
  });

  it("unknown tool returns isError", async () => {
    const result = await handle("consensus_unknown", {}, ctx);
    expect((result as any).isError).toBe(true);
  });

  it("propagates errors from engine", async () => {
    (ctx.engine.postJob as any).mockRejectedValue(new Error("Job failed"));
    const result = await handle("consensus_post_job", { title: "T", description: "D" }, ctx);
    expect((result as any).isError).toBe(true);
    const data = parseContent(result);
    expect(data.error).toContain("Job failed");
  });
});
