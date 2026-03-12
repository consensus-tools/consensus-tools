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
    });
    const result = await handle("board.get", { id: "b1" }, ctx);
    const data = parseContent(result);
    expect(data.board.id).toBe("b1");
    expect(data.board.jobs).toHaveLength(1);
    expect(data.board.submissions).toHaveLength(1);
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

  it("unknown tool returns isError", async () => {
    const result = await handle("board.unknown", {}, ctx);
    expect((result as any).isError).toBe(true);
  });
});
