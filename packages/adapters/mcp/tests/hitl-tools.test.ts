import { describe, it, expect, beforeEach, vi } from "vitest";
import { handle } from "../src/tools/hitl-tools.js";
import { makeMockCtx, parseContent } from "./helpers.js";
import type { McpContext } from "../src/context.js";

let ctx: McpContext;

beforeEach(() => {
  ctx = makeMockCtx();
});

describe("hitl tools", () => {
  it("human.approve with YES returns decision YES", async () => {
    const result = await handle("human.approve", {
      runId: "r1", replyText: "YES", idempotencyKey: "k1",
    }, ctx);
    const data = parseContent(result);
    expect(data.decision).toBe("YES");
    expect(data.runId).toBe("r1");
  });

  it("human.approve with NO returns decision NO", async () => {
    const result = await handle("human.approve", {
      runId: "r1", replyText: "NO", idempotencyKey: "k2",
    }, ctx);
    const data = parseContent(result);
    expect(data.decision).toBe("NO");
  });

  it("human.approve with REWRITE returns decision REWRITE", async () => {
    const result = await handle("human.approve", {
      runId: "r1", replyText: "REWRITE", idempotencyKey: "k3",
    }, ctx);
    const data = parseContent(result);
    expect(data.decision).toBe("REWRITE");
  });

  it("accepts synonym 'approve' as YES", async () => {
    const result = await handle("human.approve", {
      runId: "r1", replyText: "approve", idempotencyKey: "k4",
    }, ctx);
    const data = parseContent(result);
    expect(data.decision).toBe("YES");
  });

  it("calls recordVoteReceived with runId", async () => {
    await handle("human.approve", {
      runId: "r1", replyText: "YES", idempotencyKey: "k5",
    }, ctx);
    expect(ctx.hitlTracker.recordVoteReceived).toHaveBeenCalledWith("r1");
  });

  it("resumes the workflow with YES when the vote completes", async () => {
    (ctx.hitlTracker.recordVoteReceived as any).mockResolvedValue({ complete: true, total: 2, required: 2 });
    ctx.workflowRunner = { resume: vi.fn().mockResolvedValue({ status: "completed" }) } as any;
    (ctx.storage.getState as any).mockResolvedValue({ audit: [], workflowRuns: [{ runId: "r1", workflowId: "wf1" }] });
    const result = await handle("human.approve", { runId: "r1", replyText: "YES", idempotencyKey: "k6" }, ctx);
    expect((ctx.workflowRunner as any).resume).toHaveBeenCalledWith("wf1", "r1", "YES", "human");
    expect(parseContent(result).resumed).toBe(true);
  });

  it("resumes the workflow with NO so the guarded action is blocked, not approved", async () => {
    (ctx.hitlTracker.recordVoteReceived as any).mockResolvedValue({ complete: true, total: 1, required: 1 });
    ctx.workflowRunner = { resume: vi.fn().mockResolvedValue({ status: "completed" }) } as any;
    (ctx.storage.getState as any).mockResolvedValue({ audit: [], workflowRuns: [{ runId: "r1", workflowId: "wf1" }] });
    await handle("human.approve", { runId: "r1", replyText: "NO", idempotencyKey: "kno" }, ctx);
    // The decision — not just "a vote arrived" — must reach resume, so NO can abort.
    expect((ctx.workflowRunner as any).resume).toHaveBeenCalledWith("wf1", "r1", "NO", "human");
  });

  it("errors when no pending approval matches the runId", async () => {
    (ctx.hitlTracker.recordVoteReceived as any).mockResolvedValue({ complete: false, total: 0, required: 0 });
    const result = await handle("human.approve", { runId: "ghost", replyText: "YES", idempotencyKey: "kg" }, ctx);
    expect((result as any).isError).toBe(true);
    expect(result.content[0].text).toContain("No pending approval");
  });

  it("is idempotent — a replayed idempotencyKey does not double-count the vote", async () => {
    const priorReply = { type: "HITL_APPROVAL_REPLY", details: { runId: "r1", idempotencyKey: "dup", decision: "YES", approver: "human", complete: true, resumed: true } };
    (ctx.storage.getState as any).mockResolvedValue({ audit: [priorReply], workflowRuns: [] });
    const result = await handle("human.approve", { runId: "r1", replyText: "YES", idempotencyKey: "dup" }, ctx);
    expect(ctx.hitlTracker.recordVoteReceived).not.toHaveBeenCalled();
    expect(parseContent(result).duplicate).toBe(true);
  });

  it("retries a failed workflow resume on replay instead of leaving the run wedged", async () => {
    // Prior vote completed but its resume failed (resumed:false) — a same-key retry
    // must re-attempt the resume rather than short-circuiting into a permanent hang.
    const priorReply = { type: "HITL_APPROVAL_REPLY", details: { runId: "r1", idempotencyKey: "dup", decision: "YES", approver: "human", complete: true, resumed: false } };
    ctx.workflowRunner = { resume: vi.fn().mockResolvedValue({ status: "completed" }) } as any;
    (ctx.storage.getState as any).mockResolvedValue({ audit: [priorReply], workflowRuns: [{ runId: "r1", workflowId: "wf1" }] });
    const result = await handle("human.approve", { runId: "r1", replyText: "YES", idempotencyKey: "dup" }, ctx);
    expect((ctx.workflowRunner as any).resume).toHaveBeenCalledWith("wf1", "r1", "YES", "human");
    expect(ctx.hitlTracker.recordVoteReceived).not.toHaveBeenCalled();
    const data = parseContent(result);
    expect(data.duplicate).toBe(true);
    expect(data.resumed).toBe(true);
  });

  it("aggregates quorum votes — an earlier NO vetoes even when the completing vote is YES", async () => {
    const priorNo = {
      at: "2026-07-01T00:00:01.000Z",
      type: "HITL_APPROVAL_REPLY",
      details: { runId: "r1", idempotencyKey: "kA", decision: "NO", approver: "alice", complete: false, resumed: false },
    };
    (ctx.hitlTracker.recordVoteReceived as any).mockResolvedValue({ complete: true, total: 2, required: 2 });
    (ctx.hitlTracker as any).getPendingApproval.mockResolvedValue({
      runId: "r1", startedAt: "2026-07-01T00:00:00.000Z", status: "pending", requiredVotes: 2, receivedVotes: 1,
    });
    ctx.workflowRunner = { resume: vi.fn().mockResolvedValue({ status: "completed" }) } as any;
    (ctx.storage.getState as any).mockResolvedValue({ audit: [priorNo], workflowRuns: [{ runId: "r1", workflowId: "wf1" }] });
    const result = await handle("human.approve", { runId: "r1", replyText: "YES", idempotencyKey: "kB", approver: "bob" }, ctx);
    // The human veto must survive vote ordering: worst-of decisions, not last-writer-wins.
    expect((ctx.workflowRunner as any).resume).toHaveBeenCalledWith("wf1", "r1", "NO", "bob");
    const data = parseContent(result);
    expect(data.decision).toBe("YES");
    expect(data.effectiveDecision).toBe("NO");
  });

  it("aggregates a prior REWRITE over a completing YES (REWRITE outranks YES)", async () => {
    const priorRewrite = {
      at: "2026-07-01T00:00:01.000Z",
      type: "HITL_APPROVAL_REPLY",
      details: { runId: "r1", idempotencyKey: "kA", decision: "REWRITE", approver: "alice", complete: false, resumed: false },
    };
    (ctx.hitlTracker.recordVoteReceived as any).mockResolvedValue({ complete: true, total: 2, required: 2 });
    (ctx.hitlTracker as any).getPendingApproval.mockResolvedValue({
      runId: "r1", startedAt: "2026-07-01T00:00:00.000Z", status: "pending", requiredVotes: 2, receivedVotes: 1,
    });
    ctx.workflowRunner = { resume: vi.fn().mockResolvedValue({ status: "completed" }) } as any;
    (ctx.storage.getState as any).mockResolvedValue({ audit: [priorRewrite], workflowRuns: [{ runId: "r1", workflowId: "wf1" }] });
    const result = await handle("human.approve", { runId: "r1", replyText: "YES", idempotencyKey: "kB", approver: "bob" }, ctx);
    expect((ctx.workflowRunner as any).resume).toHaveBeenCalledWith("wf1", "r1", "REWRITE", "bob");
    expect(parseContent(result).effectiveDecision).toBe("REWRITE");
  });

  it("a NO outranks a prior REWRITE when NO is the completing vote", async () => {
    const priorRewrite = {
      at: "2026-07-01T00:00:01.000Z",
      type: "HITL_APPROVAL_REPLY",
      details: { runId: "r1", idempotencyKey: "kA", decision: "REWRITE", approver: "alice", complete: false, resumed: false },
    };
    (ctx.hitlTracker.recordVoteReceived as any).mockResolvedValue({ complete: true, total: 2, required: 2 });
    (ctx.hitlTracker as any).getPendingApproval.mockResolvedValue({
      runId: "r1", startedAt: "2026-07-01T00:00:00.000Z", status: "pending", requiredVotes: 2, receivedVotes: 1,
    });
    ctx.workflowRunner = { resume: vi.fn().mockResolvedValue({ status: "completed" }) } as any;
    (ctx.storage.getState as any).mockResolvedValue({ audit: [priorRewrite], workflowRuns: [{ runId: "r1", workflowId: "wf1" }] });
    await handle("human.approve", { runId: "r1", replyText: "NO", idempotencyKey: "kB", approver: "bob" }, ctx);
    expect((ctx.workflowRunner as any).resume).toHaveBeenCalledWith("wf1", "r1", "NO", "bob");
  });

  it("ignores votes from a previous approval cycle of the same runId", async () => {
    const staleNo = {
      at: "2026-06-30T00:00:00.000Z",
      type: "HITL_APPROVAL_REPLY",
      details: { runId: "r1", idempotencyKey: "old", decision: "NO", approver: "alice", complete: true, resumed: true },
    };
    (ctx.hitlTracker.recordVoteReceived as any).mockResolvedValue({ complete: true, total: 1, required: 1 });
    (ctx.hitlTracker as any).getPendingApproval.mockResolvedValue({
      runId: "r1", startedAt: "2026-07-01T00:00:00.000Z", status: "pending", requiredVotes: 1, receivedVotes: 0,
    });
    ctx.workflowRunner = { resume: vi.fn().mockResolvedValue({ status: "completed" }) } as any;
    (ctx.storage.getState as any).mockResolvedValue({ audit: [staleNo], workflowRuns: [{ runId: "r1", workflowId: "wf1" }] });
    await handle("human.approve", { runId: "r1", replyText: "YES", idempotencyKey: "new" }, ctx);
    expect((ctx.workflowRunner as any).resume).toHaveBeenCalledWith("wf1", "r1", "YES", "human");
  });

  it("does not swallow a distinct approver's vote that reuses another approver's idempotencyKey", async () => {
    const aliceReply = {
      at: "2026-07-01T00:00:01.000Z",
      type: "HITL_APPROVAL_REPLY",
      details: { runId: "r1", idempotencyKey: "shared", decision: "YES", approver: "alice", complete: false, resumed: false },
    };
    (ctx.storage.getState as any).mockResolvedValue({ audit: [aliceReply], workflowRuns: [] });
    const result = await handle("human.approve", { runId: "r1", replyText: "NO", idempotencyKey: "shared", approver: "bob" }, ctx);
    expect(ctx.hitlTracker.recordVoteReceived).toHaveBeenCalledWith("r1");
    expect(parseContent(result).duplicate).toBeUndefined();
  });

  it("unknown tool returns isError", async () => {
    const result = await handle("human.unknown", {}, ctx);
    expect((result as any).isError).toBe(true);
  });

  it("human.approve returns validation error when runId missing", async () => {
    const result = await handle("human.approve", {
      replyText: "YES", idempotencyKey: "k1",
    }, ctx);
    expect((result as any).isError).toBe(true);
  });

  it("human.approve returns validation error when replyText missing", async () => {
    const result = await handle("human.approve", {
      runId: "r1", idempotencyKey: "k1",
    }, ctx);
    expect((result as any).isError).toBe(true);
  });

  it("human.approve propagates errors from hitlTracker", async () => {
    (ctx.hitlTracker.recordVoteReceived as any).mockRejectedValue(new Error("Tracker down"));
    const result = await handle("human.approve", {
      runId: "r1", replyText: "YES", idempotencyKey: "k1",
    }, ctx);
    expect((result as any).isError).toBe(true);
    expect(result.content[0].text).toContain("Tracker down");
  });
});
