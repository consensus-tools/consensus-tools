import { describe, it, expect } from "vitest";
import { createEngine } from "./helpers.js";

async function setupApprovalEngine(policyOverrides: Record<string, any> = {}) {
  const { engine, ledger, storage, config } = await createEngine();
  await ledger.faucet("owner", 100, "test");
  await ledger.faucet("a", 10, "test");
  await ledger.faucet("b", 10, "test");
  await ledger.faucet("v1", 10, "test");
  await ledger.faucet("arb", 100, "test");
  return { engine, ledger, policyOverrides };
}

describe("APPROVAL_VOTE via JobEngine", () => {
  it("highest yes/no score wins (immediate settlement)", async () => {
    const { engine } = await setupApprovalEngine();
    const job = await engine.postJob("owner", {
      title: "approval",
      description: "test",
      reward: 1,
      stakeRequired: 0,
      expiresSeconds: 3600,
      consensusPolicy: {
        type: "APPROVAL_VOTE",
        quorum: 1,
        minScore: 1,
        minMargin: 0,
        tieBreak: "earliest",
        approvalVote: { weightMode: "equal", settlement: "immediate" },
      },
    });

    const s1 = await engine.submitJob("a", job.id, { summary: "a", artifacts: { x: 1 }, confidence: 0.5 });
    const s2 = await engine.submitJob("b", job.id, { summary: "b", artifacts: { x: 2 }, confidence: 0.5 });

    await engine.vote("v1", job.id, { submissionId: s2.id, score: 1 });

    const res = await engine.resolveJob("owner", job.id);
    expect(res.winningSubmissionIds[0]).toBe(s2.id);
  });

  it("staked: wrong votes get slashed (voteSlashPercent)", async () => {
    const { engine, ledger } = await setupApprovalEngine();
    const job = await engine.postJob("owner", {
      title: "approval-staked",
      description: "test",
      reward: 1,
      stakeRequired: 0,
      expiresSeconds: 3600,
      consensusPolicy: {
        type: "APPROVAL_VOTE",
        quorum: 1,
        minScore: 1,
        minMargin: 0,
        tieBreak: "earliest",
        approvalVote: { weightMode: "equal", settlement: "staked", voteSlashPercent: 0.5 },
      },
    });

    const s1 = await engine.submitJob("a", job.id, { summary: "a", artifacts: { x: 1 }, confidence: 0.5 });
    const s2 = await engine.submitJob("b", job.id, { summary: "b", artifacts: { x: 2 }, confidence: 0.5 });

    // Make s2 win
    await engine.vote("v1", job.id, { submissionId: s2.id, score: 1, stakeAmount: 4 });
    // Wrong vote: YES on losing s1
    await engine.vote("v1", job.id, { submissionId: s1.id, score: 1, stakeAmount: 4 });

    const res = await engine.resolveJob("owner", job.id);
    expect(res.slashes.some((s: any) => s.agentId === "v1" && s.reason === "vote_wrong")).toBe(true);
  });

  it("oracle settlement requires manual winners", async () => {
    const { engine } = await setupApprovalEngine();
    const job = await engine.postJob("owner", {
      title: "approval-oracle",
      description: "test",
      reward: 1,
      stakeRequired: 0,
      expiresSeconds: 3600,
      consensusPolicy: {
        type: "APPROVAL_VOTE",
        trustedArbiterAgentId: "arb",
        approvalVote: { settlement: "oracle", oracle: "trusted_arbiter" },
      },
    });

    const s1 = await engine.submitJob("a", job.id, { summary: "a", artifacts: { ok: true }, confidence: 0.5 });

    // Without manual winners, resolve should throw
    await expect(engine.resolveJob("owner", job.id)).rejects.toThrow();
    await expect(engine.resolveJob("arb", job.id)).rejects.toThrow();

    const res = await engine.resolveJob("arb", job.id, { manualWinners: ["a"], manualSubmissionId: s1.id });
    expect(res.winners[0]).toBe("a");
  });

  it("quorum check rejects insufficient votes", async () => {
    const { engine } = await setupApprovalEngine();
    const job = await engine.postJob("owner", {
      title: "quorum",
      description: "test",
      reward: 1,
      stakeRequired: 0,
      expiresSeconds: 3600,
      consensusPolicy: {
        type: "APPROVAL_VOTE",
        quorum: 5,
        minScore: 1,
        approvalVote: { weightMode: "equal", settlement: "immediate" },
      },
    });

    const s1 = await engine.submitJob("a", job.id, { summary: "a", artifacts: {}, confidence: 0.5 });
    await engine.vote("v1", job.id, { submissionId: s1.id, score: 1 });

    // Only 1 vote, quorum requires 5 — winners should be empty
    const res = await engine.resolveJob("owner", job.id);
    expect(res.winners).toHaveLength(0);
  });
});
