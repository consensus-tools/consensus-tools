import { describe, it, expect } from "vitest";
import { createEngine } from "./helpers.js";

describe("Manual resolution", () => {
  it("TRUSTED_ARBITER resolves with manualWinners", async () => {
    const { engine, ledger } = await createEngine();
    await ledger.faucet("owner", 100, "test");
    await ledger.faucet("arb", 100, "test");

    const job = await engine.postJob("owner", {
      title: "manual trust test",
      description: "test",
      reward: 1,
      stakeRequired: 0,
      expiresSeconds: 3600,
      consensusPolicy: { type: "TRUSTED_ARBITER", trustedArbiterAgentId: "arb" },
    });

    await engine.claimJob("a", job.id, { stakeAmount: 0, leaseSeconds: 3600 });
    await engine.claimJob("b", job.id, { stakeAmount: 0, leaseSeconds: 3600 });

    await engine.submitJob("a", job.id, { summary: "A", artifacts: { answer: "A" }, confidence: 0.9 });
    const subB = await engine.submitJob("b", job.id, { summary: "B", artifacts: { answer: "B" }, confidence: 0.1 });

    const res = await engine.resolveJob("arb", job.id, {
      manualWinners: ["b"],
      manualSubmissionId: subB.id,
    });

    expect(res.winners).toEqual(["b"]);
    expect(res.winningSubmissionIds).toEqual([subB.id]);
    expect(res.finalArtifact).toEqual({ answer: "B" });
  });

  it("TRUSTED_ARBITER rejects non-arbiter", async () => {
    const { engine, ledger } = await createEngine();
    await ledger.faucet("owner", 100, "test");

    const job = await engine.postJob("owner", {
      title: "arbiter test",
      description: "test",
      reward: 1,
      stakeRequired: 0,
      expiresSeconds: 3600,
      consensusPolicy: { type: "TRUSTED_ARBITER", trustedArbiterAgentId: "arb" },
    });

    await engine.submitJob("a", job.id, { summary: "A", confidence: 0.5 });

    await expect(
      engine.resolveJob("owner", job.id, { manualWinners: ["a"] }),
    ).rejects.toThrow("trusted arbiter");
  });

  it("OWNER_PICK resolves with owner selection", async () => {
    const { engine, ledger } = await createEngine();
    await ledger.faucet("owner", 100, "test");

    const job = await engine.postJob("owner", {
      title: "owner pick test",
      description: "test",
      reward: 1,
      stakeRequired: 0,
      expiresSeconds: 3600,
      consensusPolicy: { type: "OWNER_PICK" },
    });

    const sub = await engine.submitJob("a", job.id, { summary: "A", artifacts: { ok: true }, confidence: 0.5 });
    const res = await engine.resolveJob("owner", job.id, { manualWinners: ["a"], manualSubmissionId: sub.id });
    expect(res.winners).toEqual(["a"]);
  });

  it("OWNER_PICK rejects non-creator", async () => {
    const { engine, ledger } = await createEngine();
    await ledger.faucet("owner", 100, "test");

    const job = await engine.postJob("owner", {
      title: "owner pick test",
      description: "test",
      reward: 1,
      stakeRequired: 0,
      expiresSeconds: 3600,
      consensusPolicy: { type: "OWNER_PICK" },
    });

    await engine.submitJob("a", job.id, { summary: "A", confidence: 0.5 });

    await expect(
      engine.resolveJob("not-owner", job.id, { manualWinners: ["a"] }),
    ).rejects.toThrow("job creator");
  });
});
