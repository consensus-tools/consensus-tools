import { describe, it, expect } from "vitest";
import { createEngine } from "./helpers.js";

describe("JobEngine", () => {
  it("postJob creates an OPEN job", async () => {
    const { engine } = await createEngine();
    const job = await engine.postJob("agent1", {
      title: "Test Job",
      description: "Do the thing",
      reward: 10,
      stakeRequired: 0,
      expiresSeconds: 3600,
    });
    expect(job.id).toMatch(/^job/);
    expect(job.status).toBe("OPEN");
    expect(job.title).toBe("Test Job");
  });

  it("listJobs returns posted jobs", async () => {
    const { engine } = await createEngine();
    await engine.postJob("a1", { title: "J1", expiresSeconds: 3600 });
    await engine.postJob("a1", { title: "J2", expiresSeconds: 3600 });
    const jobs = await engine.listJobs();
    expect(jobs).toHaveLength(2);
  });

  it("listJobs filters by status", async () => {
    const { engine, ledger } = await createEngine();
    await ledger.faucet("a1", 100, "test");
    const j1 = await engine.postJob("a1", { title: "J1", expiresSeconds: 3600 });
    await engine.postJob("a1", { title: "J2", expiresSeconds: 3600 });
    await engine.claimJob("a1", j1.id, { stakeAmount: 0, leaseSeconds: 3600 });
    const open = await engine.listJobs({ status: "OPEN" });
    expect(open).toHaveLength(1);
    expect(open[0].title).toBe("J2");
  });

  it("getJob returns a single job", async () => {
    const { engine } = await createEngine();
    const job = await engine.postJob("a1", { title: "Test", expiresSeconds: 3600 });
    const found = await engine.getJob(job.id);
    expect(found?.id).toBe(job.id);
  });

  it("claimJob transitions to IN_PROGRESS", async () => {
    const { engine, ledger } = await createEngine();
    await ledger.faucet("a1", 100, "test");
    const job = await engine.postJob("a1", { title: "Test", expiresSeconds: 3600 });
    await engine.claimJob("a1", job.id, { stakeAmount: 0, leaseSeconds: 3600 });
    const updated = await engine.getJob(job.id);
    expect(updated?.status).toBe("IN_PROGRESS");
  });

  it("claimJob stakes credits via ledger", async () => {
    const { engine, ledger } = await createEngine();
    await ledger.faucet("a1", 100, "test");
    const job = await engine.postJob("a1", { title: "Test", stakeRequired: 10, expiresSeconds: 3600 });
    await engine.claimJob("a1", job.id, { stakeAmount: 10, leaseSeconds: 3600 });
    expect(await ledger.getBalance("a1")).toBe(90);
  });

  it("submitJob creates a submission", async () => {
    const { engine, ledger } = await createEngine();
    await ledger.faucet("a1", 100, "test");
    const job = await engine.postJob("a1", { title: "Test", expiresSeconds: 3600 });
    await engine.claimJob("a1", job.id, { stakeAmount: 0, leaseSeconds: 3600 });
    const sub = await engine.submitJob("a1", job.id, {
      summary: "Done",
      artifacts: { ok: true },
      confidence: 0.9,
    });
    expect(sub.id).toMatch(/^sub/);
    expect(sub.jobId).toBe(job.id);
  });

  it("resolveJob picks winner and pays out", async () => {
    const { engine, ledger } = await createEngine();
    await ledger.faucet("a1", 50, "test");
    const job = await engine.postJob("a1", {
      title: "Test",
      reward: 10,
      stakeRequired: 5,
      expiresSeconds: 3600,
    });
    await engine.claimJob("a1", job.id, { stakeAmount: 5, leaseSeconds: 3600 });
    await engine.submitJob("a1", job.id, {
      summary: "Done",
      artifacts: { ok: true },
      confidence: 0.9,
    });
    const res = await engine.resolveJob("a1", job.id);
    expect(res.winners[0]).toBe("a1");
    // 50 (faucet) - 5 (stake) + 5 (unstake) + 10 (reward) = 60
    const balance = await ledger.getBalance("a1");
    expect(balance).toBeGreaterThanOrEqual(55);
  });

  it("claimJob rejects double claim by same agent", async () => {
    const { engine, ledger } = await createEngine();
    await ledger.faucet("a1", 100, "test");
    const job = await engine.postJob("a1", { title: "Test", expiresSeconds: 3600 });
    await engine.claimJob("a1", job.id, { stakeAmount: 0, leaseSeconds: 3600 });
    await expect(
      engine.claimJob("a1", job.id, { stakeAmount: 0, leaseSeconds: 3600 }),
    ).rejects.toThrow("already claimed");
  });

  it("resolveJob rejects already resolved", async () => {
    const { engine, ledger } = await createEngine();
    await ledger.faucet("a1", 100, "test");
    const job = await engine.postJob("a1", { title: "Test", expiresSeconds: 3600 });
    await engine.claimJob("a1", job.id, { stakeAmount: 0, leaseSeconds: 3600 });
    await engine.submitJob("a1", job.id, { summary: "Done", confidence: 0.9 });
    await engine.resolveJob("a1", job.id);
    await expect(engine.resolveJob("a1", job.id)).rejects.toThrow("already resolved");
  });
});
