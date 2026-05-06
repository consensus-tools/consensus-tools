import { describe, it, expect } from "vitest";
import { HitlTracker } from "@consensus-tools/core";
import { MemoryStorage } from "@consensus-tools/storage";
import { processHumanApproval } from "../src/handlers/chat-approval.js";
import type { WebhookHandlerContext } from "../src/types.js";

async function setup() {
  const storage = new MemoryStorage();
  await storage.init();
  const hitlTracker = new HitlTracker({ storage });
  const ctx: WebhookHandlerContext = { storage, hitlTracker };
  return { storage, hitlTracker, ctx };
}

describe("processHumanApproval — producer contract", () => {
  it("emits FINAL_DECISION audit details with camelCase keys (no risk fields, by design)", async () => {
    const { storage, hitlTracker, ctx } = await setup();
    await hitlTracker.registerPendingApproval({
      runId: "run-1",
      boardId: "board-1",
      timeoutSec: 60,
      requiredVotes: 1,
    });

    const result = await processHumanApproval(ctx, "run-1", "YES", "operator");
    expect(result.ok).toBe(true);
    expect(result.complete).toBe(true);

    const state = await storage.getState();
    const finalDecisionEvent = state.audit.find((e) => e.type === "FINAL_DECISION");
    expect(finalDecisionEvent).toBeDefined();

    const details = finalDecisionEvent!.details as Record<string, unknown>;
    expect(details).toMatchObject({
      runId: "run-1",
      decision: "YES",
      approver: "operator",
      votesReceived: 1,
      votesRequired: 1,
    });

    // Regression guard: legacy snake_case keys must not appear at this trust boundary
    expect(details).not.toHaveProperty("votes_received");
    expect(details).not.toHaveProperty("votes_required");
    expect(details).not.toHaveProperty("risk_score");
    expect(details).not.toHaveProperty("guard_type");
  });

  it("propagates idempotencyKey into FINAL_DECISION details (camelCase)", async () => {
    const { storage, hitlTracker, ctx } = await setup();
    await hitlTracker.registerPendingApproval({
      runId: "run-2",
      boardId: "board-1",
      timeoutSec: 60,
      requiredVotes: 1,
    });

    await processHumanApproval(ctx, "run-2", "NO", "operator", "idem-abc");

    const state = await storage.getState();
    const finalDecisionEvent = state.audit.find(
      (e) => e.type === "FINAL_DECISION" && (e.details as Record<string, unknown>).runId === "run-2",
    );
    expect(finalDecisionEvent).toBeDefined();

    const details = finalDecisionEvent!.details as Record<string, unknown>;
    expect(details.idempotencyKey).toBe("idem-abc");
    expect(details).not.toHaveProperty("idempotency_key");
  });

  it("emits VOTE_RECEIVED (not FINAL_DECISION) when quorum not met", async () => {
    const { storage, hitlTracker, ctx } = await setup();
    await hitlTracker.registerPendingApproval({
      runId: "run-3",
      boardId: "board-1",
      timeoutSec: 60,
      requiredVotes: 2,
    });

    const result = await processHumanApproval(ctx, "run-3", "YES", "operator");
    expect(result.complete).toBe(false);

    const state = await storage.getState();
    expect(state.audit.find((e) => e.type === "FINAL_DECISION")).toBeUndefined();
    const voteEvent = state.audit.find((e) => e.type === "VOTE_RECEIVED");
    expect(voteEvent).toBeDefined();

    // VOTE_RECEIVED also follows camelCase contract
    const details = voteEvent!.details as Record<string, unknown>;
    expect(details).toMatchObject({
      runId: "run-3",
      decision: "YES",
      votesReceived: 1,
      votesRequired: 2,
    });
  });
});
