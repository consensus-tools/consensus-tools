import { describe, it, expect } from "vitest";
import { approvalVote } from "../src/index.js";
import { makeJob, makeSubmission, makeVote, makeInput } from "./helpers.js";

function makeApprovalJob(overrides: Record<string, unknown> = {}) {
  return makeJob({
    consensusPolicy: {
      type: "APPROVAL_VOTE",
      quorum: 1,
      minScore: 1,
      minMargin: 0,
      tieBreak: "earliest",
      approvalVote: { weightMode: "equal", settlement: "immediate" },
      ...overrides,
    },
  });
}

describe("approvalVote", () => {
  it("returns empty when no submissions", () => {
    const result = approvalVote(makeInput({ job: makeApprovalJob() }));
    expect(result.winners).toEqual([]);
  });

  it("returns empty when quorum not met", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const v1 = makeVote({ submissionId: s1.id, score: 1 });
    const result = approvalVote(makeInput({
      job: makeApprovalJob({ quorum: 3 }),
      submissions: [s1],
      votes: [v1],
    }));
    expect(result.winners).toEqual([]);
    expect(result.consensusTrace.reason).toBe("quorum_not_met");
  });

  it("highest weighted score wins with equal weight", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const s2 = makeSubmission({ agentId: "a2" });
    const votes = [
      makeVote({ submissionId: s1.id, score: 1, agentId: "v1" }),
      makeVote({ submissionId: s2.id, score: 1, agentId: "v2" }),
      makeVote({ submissionId: s2.id, score: 1, agentId: "v3" }),
    ];
    const result = approvalVote(makeInput({
      job: makeApprovalJob({ quorum: 1, minScore: 1 }),
      submissions: [s1, s2],
      votes,
    }));
    expect(result.winners).toEqual(["a2"]);
  });

  it("applies explicit weight mode", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const s2 = makeSubmission({ agentId: "a2" });
    const votes = [
      makeVote({ submissionId: s1.id, score: 1, weight: 5, agentId: "v1" }),
      makeVote({ submissionId: s2.id, score: 1, weight: 1, agentId: "v2" }),
    ];
    const result = approvalVote(makeInput({
      job: makeApprovalJob({ approvalVote: { weightMode: "explicit", settlement: "immediate" } }),
      submissions: [s1, s2],
      votes,
    }));
    expect(result.winners).toEqual(["a1"]);
  });

  it("applies reputation weight mode", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const s2 = makeSubmission({ agentId: "a2" });
    const votes = [
      makeVote({ submissionId: s1.id, score: 1, agentId: "low-rep" }),
      makeVote({ submissionId: s2.id, score: 1, agentId: "high-rep" }),
    ];
    const result = approvalVote(makeInput({
      job: makeApprovalJob({ approvalVote: { weightMode: "reputation", settlement: "immediate" } }),
      submissions: [s1, s2],
      votes,
      reputation: (id: string) => id === "high-rep" ? 100 : 10,
    }));
    expect(result.winners).toEqual(["a2"]);
  });

  it("returns empty when minScore not met", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const votes = [makeVote({ submissionId: s1.id, score: 0.5, agentId: "v1" })];
    const result = approvalVote(makeInput({
      job: makeApprovalJob({ minScore: 2 }),
      submissions: [s1],
      votes,
    }));
    expect(result.winners).toEqual([]);
    expect(result.consensusTrace.reason).toBe("threshold_not_met");
  });

  it("returns empty when minMargin not met", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const s2 = makeSubmission({ agentId: "a2" });
    const votes = [
      makeVote({ submissionId: s1.id, score: 1, agentId: "v1" }),
      makeVote({ submissionId: s2.id, score: 1, agentId: "v2" }),
    ];
    const result = approvalVote(makeInput({
      job: makeApprovalJob({ minMargin: 5 }),
      submissions: [s1, s2],
      votes,
    }));
    expect(result.winners).toEqual([]);
  });

  it("oracle settlement with manual winners returns them", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const result = approvalVote(makeInput({
      job: makeApprovalJob({ approvalVote: { settlement: "oracle" } }),
      submissions: [s1],
      manualWinnerAgentIds: ["a1"],
      manualSubmissionId: s1.id,
    }));
    expect(result.winners).toEqual(["a1"]);
    expect(result.consensusTrace.mode).toBe("manual");
  });

  it("oracle settlement without manual returns awaiting", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const votes = [makeVote({ submissionId: s1.id, score: 1, agentId: "v1" })];
    const result = approvalVote(makeInput({
      job: makeApprovalJob({ approvalVote: { settlement: "oracle" } }),
      submissions: [s1],
      votes,
    }));
    expect(result.winners).toEqual([]);
    expect(result.consensusTrace.mode).toBe("awaiting_oracle");
  });

  it("tie-break by confidence when configured", () => {
    const s1 = makeSubmission({ agentId: "a1", confidence: 0.5, submittedAt: "2026-01-01T08:00:00Z" });
    const s2 = makeSubmission({ agentId: "a2", confidence: 0.9, submittedAt: "2026-01-01T09:00:00Z" });
    const votes = [
      makeVote({ submissionId: s1.id, score: 1, agentId: "v1" }),
      makeVote({ submissionId: s2.id, score: 1, agentId: "v2" }),
    ];
    const result = approvalVote(makeInput({
      job: makeApprovalJob({ tieBreak: "confidence" }),
      submissions: [s1, s2],
      votes,
    }));
    expect(result.winners).toEqual(["a2"]);
  });
});
