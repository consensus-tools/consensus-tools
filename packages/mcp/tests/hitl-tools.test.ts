import { describe, it, expect, beforeEach } from "vitest";
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

  it("calls resolveApproval when vote is complete", async () => {
    (ctx.hitlTracker.recordVoteReceived as any).mockResolvedValue({ complete: true, total: 2, required: 2 });
    await handle("human.approve", {
      runId: "r1", replyText: "YES", idempotencyKey: "k6",
    }, ctx);
    expect(ctx.hitlTracker.resolveApproval).toHaveBeenCalledWith("r1");
  });

  it("does NOT call resolveApproval when vote is incomplete", async () => {
    await handle("human.approve", {
      runId: "r1", replyText: "YES", idempotencyKey: "k7",
    }, ctx);
    expect(ctx.hitlTracker.resolveApproval).not.toHaveBeenCalled();
  });

  it("unknown tool returns isError", async () => {
    const result = await handle("human.unknown", {}, ctx);
    expect((result as any).isError).toBe(true);
  });
});
