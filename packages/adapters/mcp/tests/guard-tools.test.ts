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
    expect(result.content[0].text).toContain("Engine failure");
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

describe("policy tools", () => {
  it("policy.assign creates a new assignment", async () => {
    const result = await handle("policy.assign", {
      boardId: "b1",
      policyId: "pol-1",
      participants: ["agent-a", "agent-b"],
      quorum: 0.7,
    }, ctx);
    expect((result as any).isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.boardId).toBe("b1");
    expect(data.policyId).toBe("pol-1");
    expect(data.participants).toEqual(["agent-a", "agent-b"]);
  });

  it("policy.assign returns isError when boardId missing", async () => {
    const result = await handle("policy.assign", {
      policyId: "pol-1",
      participants: [],
      quorum: 0.5,
    }, ctx);
    expect((result as any).isError).toBe(true);
  });

  it("policy.assign returns isError when policyId missing", async () => {
    const result = await handle("policy.assign", {
      boardId: "b1",
      participants: [],
      quorum: 0.5,
    }, ctx);
    expect((result as any).isError).toBe(true);
  });

  it("policy.assign defaults weightingMode to hybrid", async () => {
    const result = await handle("policy.assign", {
      boardId: "b1",
      policyId: "pol-1",
      participants: [],
      quorum: 0.5,
    }, ctx);
    const data = parseContent(result);
    expect(data.weightingMode).toBe("hybrid");
  });

  it("policy.list returns all assignments", async () => {
    // First assign a policy
    await handle("policy.assign", {
      boardId: "b1",
      policyId: "pol-1",
      participants: ["a"],
      quorum: 0.5,
    }, ctx);
    const result = await handle("policy.list", {}, ctx);
    const data = parseContent(result);
    expect(Array.isArray(data)).toBe(true);
  });

  it("policy.list filters by boardId", async () => {
    const result = await handle("policy.list", { boardId: "nonexistent" }, ctx);
    const data = parseContent(result);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(0);
  });
});
