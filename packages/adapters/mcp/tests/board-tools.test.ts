import { describe, it, expect, beforeEach } from "vitest";
import { handle } from "../src/tools/board-tools.js";
import { makeMockCtx, parseContent } from "./helpers.js";
import type { McpContext } from "../src/context.js";

let ctx: McpContext;

beforeEach(() => {
  ctx = makeMockCtx();
});

describe("board tools", () => {
  it("board.list derives boards from jobs", async () => {
    (ctx.storage.getState as any).mockResolvedValue({
      jobs: [
        { id: "j1", boardId: "b1" },
        { id: "j2", boardId: "b2" },
        { id: "j3", boardId: "b1" },
      ],
      submissions: [], audit: [], guardResults: [],
    });
    const result = await handle("board.list", {}, ctx);
    const data = parseContent(result);
    expect(data.boards).toHaveLength(2);
    expect(data.boards.map((b: any) => b.id)).toContain("b1");
    expect(data.boards.map((b: any) => b.id)).toContain("b2");
  });

  it("board.list returns empty when no jobs", async () => {
    const result = await handle("board.list", {}, ctx);
    const data = parseContent(result);
    expect(data.boards).toHaveLength(0);
  });

  it("board.get returns jobs for board", async () => {
    (ctx.storage.getState as any).mockResolvedValue({
      jobs: [{ id: "j1", boardId: "b1" }, { id: "j2", boardId: "b2" }],
      submissions: [{ id: "s1", boardId: "b1" }],
      guardResults: [],
      audit: [],
    });
    const result = await handle("board.get", { id: "b1" }, ctx);
    const data = parseContent(result);
    expect(data.board.id).toBe("b1");
    expect(data.board.jobs).toHaveLength(1);
    expect(data.board.submissions).toHaveLength(1);
  });

  it("board.get returns only guard results scoped to the requested board", async () => {
    (ctx.storage.getState as any).mockResolvedValue({
      jobs: [],
      submissions: [],
      guardResults: [
        { audit_id: "a1", guard_type: "send_email" },
        { audit_id: "a2", guard_type: "send_email" },
      ],
      audit: [
        { type: "FINAL_DECISION", details: { boardId: "b1", auditId: "a1" } },
        { type: "FINAL_DECISION", details: { boardId: "b2", auditId: "a2" } },
      ],
    });
    const result = await handle("board.get", { id: "b1" }, ctx);
    const data = parseContent(result);
    expect(data.board.guardResults.map((g: any) => g.audit_id)).toEqual(["a1"]);
  });

  it("board.get includes workflow-produced guard results (audit_id === event id)", async () => {
    // Workflow guard nodes set guardResult.audit_id to the audit event's own id
    // (details carries boardId but no auditId). Both linkage shapes must be covered.
    (ctx.storage.getState as any).mockResolvedValue({
      jobs: [],
      submissions: [],
      guardResults: [
        { audit_id: "engine-a1", guard_type: "send_email" },
        { audit_id: "wf-evt-1", guard_type: "code_merge" },
      ],
      audit: [
        { id: "x", type: "PROPOSED_ACTION", details: { boardId: "b1", auditId: "engine-a1" } },
        { id: "wf-evt-1", type: "FINAL_DECISION", details: { boardId: "b1" } },
      ],
    });
    const result = await handle("board.get", { id: "b1" }, ctx);
    const data = parseContent(result);
    expect(data.board.guardResults.map((g: any) => g.audit_id).sort()).toEqual(["engine-a1", "wf-evt-1"]);
  });

  it("run.get returns status from engine", async () => {
    (ctx.engine.getStatus as any).mockResolvedValue({ job: { id: "j1" }, submissions: [] });
    const result = await handle("run.get", { id: "j1" }, ctx);
    const data = parseContent(result);
    expect(data.job.id).toBe("j1");
  });

  it("run.get falls back to guard result by audit_id", async () => {
    (ctx.storage.getState as any).mockResolvedValue({
      jobs: [], submissions: [],
      guardResults: [{ audit_id: "aud-1", decision: "ALLOW" }],
      audit: [{ id: "e1", details: { auditId: "aud-1" } }],
    });
    const result = await handle("run.get", { id: "aud-1" }, ctx);
    const data = parseContent(result);
    expect(data.run.decision).toBe("ALLOW");
    expect(data.events).toHaveLength(1);
  });

  it("run.get returns isError when not found", async () => {
    const result = await handle("run.get", { id: "nonexistent" }, ctx);
    expect((result as any).isError).toBe(true);
  });

  it("audit.search filters by query", async () => {
    (ctx.storage.getState as any).mockResolvedValue({
      jobs: [], submissions: [], guardResults: [],
      audit: [
        { id: "e1", type: "GUARD", details: { msg: "hello" } },
        { id: "e2", type: "OTHER", details: { msg: "world" } },
      ],
    });
    const result = await handle("audit.search", { query: "hello" }, ctx);
    const data = parseContent(result);
    expect(data.events).toHaveLength(1);
    expect(data.count).toBe(1);
  });

  it("audit.search respects limit capped at 500", async () => {
    const result = await handle("audit.search", { limit: 1000 }, ctx);
    // Should not crash; limit is clamped internally
    expect(result.content).toHaveLength(1);
  });

  it("audit.search treats a null/omitted limit as the default 100, not 1", async () => {
    (ctx.storage.getState as any).mockResolvedValue({
      jobs: [], submissions: [], guardResults: [],
      audit: [
        { id: "e1", type: "A", details: {} },
        { id: "e2", type: "B", details: {} },
        { id: "e3", type: "C", details: {} },
      ],
    });
    for (const args of [{}, { limit: null }]) {
      const result = await handle("audit.search", args as any, ctx);
      expect(parseContent(result).events).toHaveLength(3);
    }
  });

  it("audit.search treats a non-numeric limit as 100, not an unbounded slice", async () => {
    (ctx.storage.getState as any).mockResolvedValue({
      jobs: [], submissions: [], guardResults: [],
      audit: Array.from({ length: 150 }, (_, i) => ({ id: `e${i}`, type: "A", details: {} })),
    });
    // NaN would make slice(-NaN) return the whole 150-row log; the guard clamps to 100.
    const result = await handle("audit.search", { limit: "abc" } as any, ctx);
    expect(parseContent(result).events).toHaveLength(100);
  });

  it("audit.search caps an over-large limit at 500", async () => {
    (ctx.storage.getState as any).mockResolvedValue({
      jobs: [], submissions: [], guardResults: [],
      audit: Array.from({ length: 600 }, (_, i) => ({ id: `e${i}`, type: "A", details: {} })),
    });
    const result = await handle("audit.search", { limit: 9999 }, ctx);
    expect(parseContent(result).events).toHaveLength(500);
  });

  it("unknown tool returns isError", async () => {
    const result = await handle("board.unknown", {}, ctx);
    expect((result as any).isError).toBe(true);
  });
});
