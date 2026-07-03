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

describe("HitlTracker.resumeDeadlineTracking", () => {
  it("re-arms deadline enforcement for approvals persisted by a previous process", async () => {
    const { storage } = await createTempStorage();
    // Previous process registers an approval that expires immediately, then dies.
    const prev = new HitlTracker({ storage });
    await prev.registerPendingApproval({ runId: "r-restart", boardId: "b1", timeoutSec: 0 });
    prev.stop();

    // New process: without resumeDeadlineTracking nothing ever expires this approval.
    const expired: Array<{ runId: string; decision: string }> = [];
    tracker = new HitlTracker({
      storage,
      onExpiry: async (approval, decision) => {
        expired.push({ runId: approval.runId, decision });
      },
    });
    await tracker.resumeDeadlineTracking();

    expect(expired).toEqual([{ runId: "r-restart", decision: "BLOCK" }]);
    expect(await tracker.listPending()).toHaveLength(0);
  });

  it("is a no-op when nothing is pending", async () => {
    const t = await makeTracker();
    await expect(t.resumeDeadlineTracking()).resolves.toBeUndefined();
  });
});
