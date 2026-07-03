import { describe, it, expect, beforeEach } from "vitest";
import { handle } from "../src/tools/guard-tools.js";
import { makeMockCtx, parseContent } from "./helpers.js";
import type { McpContext } from "../src/context.js";

let ctx: McpContext;

beforeEach(() => {
  ctx = makeMockCtx();
});

describe("guard payload translation (advertised keys → evaluator keys)", () => {
  it("guard.code_merge maps filesChanged→files and diff→diff_summary", async () => {
    await handle("guard.code_merge", {
      boardId: "b1",
      action: { type: "code_merge", payload: { filesChanged: ["src/auth/login.ts"], diff: "fix sql injection" } },
    }, ctx);
    const passed = (ctx.guardEngine.evaluate as any).mock.calls[0][0];
    expect(passed.action.payload.files).toEqual(["src/auth/login.ts"]);
    expect(passed.action.payload.diff_summary).toBe("fix sql injection");
  });

  it("guard.deployment maps deployEnv→env so prod is seen as prod", async () => {
    await handle("guard.deployment", {
      boardId: "b1",
      action: { type: "deployment", payload: { deployEnv: "prod" } },
    }, ctx);
    const passed = (ctx.guardEngine.evaluate as any).mock.calls[0][0];
    expect(passed.action.payload.env).toBe("prod");
  });

  it("guard.publish maps content→text and support_reply maps replyText→message", async () => {
    await handle("guard.publish", { boardId: "b1", action: { type: "publish", payload: { content: "call 123-45-6789" } } }, ctx);
    expect((ctx.guardEngine.evaluate as any).mock.calls[0][0].action.payload.text).toBe("call 123-45-6789");
    (ctx.guardEngine.evaluate as any).mockClear();
    await handle("guard.support_reply", { boardId: "b1", action: { type: "support_reply", payload: { replyText: "full refund" } } }, ctx);
    expect((ctx.guardEngine.evaluate as any).mock.calls[0][0].action.payload.message).toBe("full refund");
  });

  it("guard.permission_escalation maps a wildcard in requestedPermissions→permission '*'", async () => {
    await handle("guard.permission_escalation", {
      boardId: "b1",
      action: { type: "permission_escalation", payload: { requestedPermissions: ["*"] } },
    }, ctx);
    expect((ctx.guardEngine.evaluate as any).mock.calls[0][0].action.payload.permission).toBe("*");
  });

  it("guard.send_email maps attachments[]→attachment so the evaluator sees them", async () => {
    await handle("guard.send_email", {
      boardId: "b1",
      action: { type: "send_email", payload: { to: "user@ext.com", attachments: ["report.pdf"] } },
    }, ctx);
    const passed = (ctx.guardEngine.evaluate as any).mock.calls.at(-1)[0];
    expect(passed.action.payload.attachment).toEqual(["report.pdf"]);
  });

  it("resolveBoardPolicy carries an assigned riskThreshold into guardEngine.evaluate", async () => {
    await handle("policy.assign", {
      boardId: "rt", policyId: "p", participants: [], quorum: 0.7, riskThreshold: 0.4,
    }, ctx);
    await handle("guard.deployment", { boardId: "rt", action: { type: "deployment", payload: { deployEnv: "prod" } } }, ctx);
    const [, policyArg] = (ctx.guardEngine.evaluate as any).mock.calls.at(-1);
    expect(policyArg?.riskThreshold).toBe(0.4);
  });

  it("passes the board's assigned policy into guardEngine.evaluate", async () => {
    await handle("policy.assign", { boardId: "b1", policyId: "strict", participants: [], quorum: 0.9 }, ctx);
    await handle("guard.deployment", { boardId: "b1", action: { type: "deployment", payload: { deployEnv: "prod" } } }, ctx);
    const [, policyArg] = (ctx.guardEngine.evaluate as any).mock.calls.at(-1);
    expect(policyArg?.policyId).toBe("strict");
    expect(policyArg?.quorum).toBe(0.9);
  });

  it("passes no policy for a board with no assignment", async () => {
    await handle("guard.deployment", { boardId: "unassigned", action: { type: "deployment", payload: { deployEnv: "prod" } } }, ctx);
    const [, policyArg] = (ctx.guardEngine.evaluate as any).mock.calls.at(-1);
    expect(policyArg).toBeUndefined();
  });

  it("guard.evaluate with a domain type also translates advertised payload keys", async () => {
    await handle("guard.evaluate", {
      boardId: "b1",
      action: { type: "code_merge", payload: { filesChanged: ["src/auth/x.ts"], diff: "tweak" } },
    }, ctx);
    const passed = (ctx.guardEngine.evaluate as any).mock.calls.at(-1)[0];
    expect(passed.action.payload.files).toEqual(["src/auth/x.ts"]);
    expect(passed.action.payload.diff_summary).toBe("tweak");
  });

  it("guard.evaluate rejects a missing action instead of silently allowing", async () => {
    const result = await handle("guard.evaluate", { boardId: "b1" }, ctx);
    expect((result as any).isError).toBe(true);
    expect(ctx.guardEngine.evaluate).not.toHaveBeenCalled();
  });

  it("guard.evaluate rejects an unknown action type", async () => {
    const result = await handle("guard.evaluate", { boardId: "b1", action: { type: "not_a_domain", payload: {} } }, ctx);
    expect((result as any).isError).toBe(true);
  });

  it("guard.evaluate rejects a schema type with no evaluator (seo_fix/diff_check → generic ALLOW)", async () => {
    for (const type of ["seo_fix", "diff_check"]) {
      const result = await handle("guard.evaluate", { boardId: "b1", action: { type, payload: {} } }, ctx);
      expect((result as any).isError).toBe(true);
    }
    expect(ctx.guardEngine.evaluate).not.toHaveBeenCalled();
  });

  it("guard.evaluate accepts a custom domain the engine has an evaluator for", async () => {
    (ctx.guardEngine as any).supportedGuardTypes.mockReturnValue([
      "send_email", "code_merge", "publish", "support_reply",
      "agent_action", "deployment", "permission_escalation", "db_migration",
    ]);
    const result = await handle("guard.evaluate", {
      boardId: "b1",
      action: { type: "db_migration", payload: { table: "users" } },
    }, ctx);
    expect((result as any).isError).toBeUndefined();
    expect(ctx.guardEngine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ action: expect.objectContaining({ type: "db_migration" }) }),
    );
  });
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
      action: { type: "send_email", payload: {} },
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
      action: { type: "send_email", payload: {} },
    }, ctx);
    expect((result as any).isError).toBe(true);
    expect(result.content[0].text).toContain("Engine failure");
  });

  it("passes agentId from args", async () => {
    await handle("guard.evaluate", {
      boardId: "b1",
      agentId: "agent-x",
      action: { type: "send_email", payload: {} },
    }, ctx);
    expect(ctx.guardEngine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-x" }),
    );
  });
});

describe("standalone guard HITL wiring", () => {
  const requireHumanResult = {
    decision: "REQUIRE_HUMAN",
    reason: "High risk",
    risk_score: 0.9,
    audit_id: "audit-hitl",
    votes: [],
    guard_type: "deployment",
  };

  it("registers a pending approval when a guard returns REQUIRE_HUMAN", async () => {
    (ctx.guardEngine.evaluate as any).mockResolvedValue(requireHumanResult);
    const result = await handle("guard.deployment", {
      boardId: "b1",
      runId: "run-42",
      action: { type: "deployment", payload: { deployEnv: "prod" } },
    }, ctx);
    expect((ctx.hitlTracker as any).registerPendingApproval).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-42", boardId: "b1" }),
    );
    const data = parseContent(result);
    expect(data.decision).toBe("REQUIRE_HUMAN");
    expect(data.runId).toBe("run-42");
    expect(data.next_step).toEqual(
      expect.objectContaining({ tool: "human.approve", input: expect.objectContaining({ runId: "run-42" }) }),
    );
  });

  it("mints a runId when the caller does not provide one", async () => {
    (ctx.guardEngine.evaluate as any).mockResolvedValue(requireHumanResult);
    const result = await handle("guard.deployment", {
      boardId: "b1",
      action: { type: "deployment", payload: { deployEnv: "prod" } },
    }, ctx);
    const data = parseContent(result);
    expect(typeof data.runId).toBe("string");
    expect(data.runId.length).toBeGreaterThan(0);
    expect((ctx.hitlTracker as any).registerPendingApproval).toHaveBeenCalledWith(
      expect.objectContaining({ runId: data.runId }),
    );
  });

  it("does not re-register when a pending approval already exists for the runId", async () => {
    (ctx.guardEngine.evaluate as any).mockResolvedValue(requireHumanResult);
    (ctx.hitlTracker as any).getPendingApproval.mockResolvedValue({
      id: "hitl-existing", runId: "run-42", boardId: "b1", status: "pending",
      timeoutSec: 900, requiredVotes: 1, receivedVotes: 0,
      mode: "approval", autoDecisionOnExpiry: "BLOCK",
    });
    const result = await handle("guard.deployment", {
      boardId: "b1",
      runId: "run-42",
      action: { type: "deployment", payload: { deployEnv: "prod" } },
    }, ctx);
    expect((ctx.hitlTracker as any).registerPendingApproval).not.toHaveBeenCalled();
    const data = parseContent(result);
    expect(data.runId).toBe("run-42");
  });

  it("treats an empty-string runId as absent and mints a real one", async () => {
    (ctx.guardEngine.evaluate as any).mockResolvedValue(requireHumanResult);
    const result = await handle("guard.deployment", {
      boardId: "b1",
      runId: "",
      action: { type: "deployment", payload: { deployEnv: "prod" } },
    }, ctx);
    const data = parseContent(result);
    expect(data.runId).not.toBe("");
    expect(data.runId.length).toBeGreaterThan(0);
    expect((ctx.hitlTracker as any).registerPendingApproval).toHaveBeenCalledWith(
      expect.objectContaining({ runId: data.runId }),
    );
  });

  it("rejects a runId whose pending approval belongs to a different board", async () => {
    (ctx.guardEngine.evaluate as any).mockResolvedValue(requireHumanResult);
    (ctx.hitlTracker as any).getPendingApproval.mockResolvedValue({
      id: "hitl-other", runId: "run-42", boardId: "other-board", status: "pending",
      timeoutSec: 900, requiredVotes: 1, receivedVotes: 0,
      mode: "approval", autoDecisionOnExpiry: "BLOCK",
    });
    const result = await handle("guard.deployment", {
      boardId: "b1",
      runId: "run-42",
      action: { type: "deployment", payload: { deployEnv: "prod" } },
    }, ctx);
    expect((result as any).isError).toBe(true);
    expect((ctx.hitlTracker as any).registerPendingApproval).not.toHaveBeenCalled();
  });

  it("does not register an approval for non-REQUIRE_HUMAN decisions", async () => {
    const result = await handle("guard.deployment", {
      boardId: "b1",
      action: { type: "deployment", payload: { deployEnv: "dev" } },
    }, ctx);
    expect((ctx.hitlTracker as any).registerPendingApproval).not.toHaveBeenCalled();
    const data = parseContent(result);
    expect(data.decision).toBe("ALLOW");
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

  it("policy.assign rejects an out-of-range quorum", async () => {
    const result = await handle("policy.assign", {
      boardId: "b1", policyId: "pol-1", participants: [], quorum: 5,
    }, ctx);
    expect((result as any).isError).toBe(true);
  });

  it("policy.assign rejects an invalid weightingMode", async () => {
    const result = await handle("policy.assign", {
      boardId: "b1", policyId: "pol-1", participants: [], quorum: 0.5, weightingMode: "banana",
    }, ctx);
    expect((result as any).isError).toBe(true);
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
