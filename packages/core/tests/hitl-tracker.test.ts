import { describe, it, expect, afterEach } from "vitest";
import { createTempStorage } from "./helpers.js";
import { HitlTracker } from "../src/engine/hitl-tracker.js";

let tracker: HitlTracker;

afterEach(() => {
  tracker?.stop();
});

async function makeTracker() {
  const { storage } = await createTempStorage();
  tracker = new HitlTracker({ storage });
  return tracker;
}

describe("HitlTracker", () => {
  it("registerPendingApproval persists to storage", async () => {
    const t = await makeTracker();
    await t.registerPendingApproval({ runId: "r1", boardId: "b1", timeoutSec: 60 });
    const pending = await t.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].runId).toBe("r1");
  });

  it("recordVoteReceived increments and completes", async () => {
    const t = await makeTracker();
    await t.registerPendingApproval({ runId: "r1", boardId: "b1", timeoutSec: 60, requiredVotes: 2 });

    const r1 = await t.recordVoteReceived("r1");
    expect(r1.complete).toBe(false);
    expect(r1.total).toBe(1);

    const r2 = await t.recordVoteReceived("r1");
    expect(r2.complete).toBe(true);
    expect(r2.total).toBe(2);

    // After completing, should no longer be pending
    const pending = await t.listPending();
    expect(pending).toHaveLength(0);
  });

  it("resolveApproval marks as resolved", async () => {
    const t = await makeTracker();
    await t.registerPendingApproval({ runId: "r1", boardId: "b1", timeoutSec: 60 });
    await t.resolveApproval("r1");
    const pending = await t.listPending();
    expect(pending).toHaveLength(0);
  });

  it("cancelApproval marks as expired", async () => {
    const t = await makeTracker();
    await t.registerPendingApproval({ runId: "r1", boardId: "b1", timeoutSec: 60 });
    await t.cancelApproval("r1");
    const pending = await t.listPending();
    expect(pending).toHaveLength(0);
  });

  it("stop clears interval without error", async () => {
    const t = await makeTracker();
    await t.registerPendingApproval({ runId: "r1", boardId: "b1", timeoutSec: 60 });
    t.stop(); // Should not throw
    t.stop(); // Idempotent
  });
});
