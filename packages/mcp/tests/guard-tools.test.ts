import { describe, it, expect, beforeEach } from "vitest";
import { handle } from "../src/tools/guard-tools.js";
import { makeMockCtx, parseContent } from "./helpers.js";
import type { McpContext } from "../src/context.js";

let ctx: McpContext;

beforeEach(() => {
  ctx = makeMockCtx();
});

describe("guard tools", () => {
  it("guard.evaluate calls guardEngine.evaluate with action", async () => {
    const result = await handle("guard.evaluate", {
      boardId: "b1",
      action: { type: "send_email", payload: { to: "user@test.com" } },
    }, ctx);
    expect(ctx.guardEngine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ boardId: "b1", action: { type: "send_email", payload: { to: "user@test.com" } } }),
    );
    const data = parseContent(result);
    expect(data.decision).toBe("ALLOW");
  });

  it("guard.send_email maps to action type send_email", async () => {
    await handle("guard.send_email", {
      boardId: "b1",
      action: { type: "send_email", payload: {} },
    }, ctx);
    expect(ctx.guardEngine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.objectContaining({ type: "send_email" }) }),
    );
  });

  it("guard.code_merge maps to action type code_merge", async () => {
    await handle("guard.code_merge", {
      boardId: "b1",
      action: { type: "code_merge", payload: {} },
    }, ctx);
    expect(ctx.guardEngine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.objectContaining({ type: "code_merge" }) }),
    );
  });

  it("guard.deployment maps to action type deployment", async () => {
    await handle("guard.deployment", {
      boardId: "b1",
      action: { type: "deployment", payload: {} },
    }, ctx);
    expect(ctx.guardEngine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.objectContaining({ type: "deployment" }) }),
    );
  });

  it("returns JSON result in content", async () => {
    const result = await handle("guard.evaluate", {
      boardId: "b1",
      action: { type: "test", payload: {} },
    }, ctx);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    const data = parseContent(result);
    expect(data.audit_id).toBe("audit-1");
  });

  it("returns isError when guardEngine throws", async () => {
    (ctx.guardEngine.evaluate as any).mockRejectedValue(new Error("Engine failure"));
    const result = await handle("guard.evaluate", {
      boardId: "b1",
      action: { type: "test", payload: {} },
    }, ctx);
    expect((result as any).isError).toBe(true);
    const data = parseContent(result);
    expect(data.error).toContain("Engine failure");
  });

  it("passes agentId from args", async () => {
    await handle("guard.evaluate", {
      boardId: "b1",
      agentId: "agent-x",
      action: { type: "test", payload: {} },
    }, ctx);
    expect(ctx.guardEngine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-x" }),
    );
  });
});
