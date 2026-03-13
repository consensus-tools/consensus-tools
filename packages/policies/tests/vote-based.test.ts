import { describe, it, expect } from "vitest";
import { majorityVote, weightedVoteSimple, weightedReputation } from "../src/index.js";
import { makeJob, makeSubmission, makeVote, makeInput } from "./helpers.js";

function voteJob(type: string, quorum?: number) {
  return makeJob({ consensusPolicy: { type: type as any, quorum } });
}

describe("majorityVote", () => {
  it("returns empty when no submissions", () => {
    const result = majorityVote(makeInput({ job: voteJob("MAJORITY_VOTE") }));
    expect(result.winners).toEqual([]);
  });

  it("returns empty when quorum not met", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const result = majorityVote(makeInput({
      job: voteJob("MAJORITY_VOTE", 3),
      submissions: [s1],
      votes: [makeVote({ submissionId: s1.id })],
    }));
    expect(result.winners).toEqual([]);
  });

  it("highest vote count wins", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const s2 = makeSubmission({ agentId: "a2" });
    const votes = [
      makeVote({ submissionId: s1.id, score: 1 }),
      makeVote({ submissionId: s1.id, score: 1 }),
      makeVote({ submissionId: s1.id, score: 1 }),
      makeVote({ submissionId: s2.id, score: 1 }),
    ];
    const result = majorityVote(makeInput({
      job: voteJob("MAJORITY_VOTE"),
      submissions: [s1, s2],
      votes,
    }));
    expect(result.winners).toEqual(["a1"]);
  });
});

describe("weightedVoteSimple", () => {
  it("applies explicit weights from votes", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const s2 = makeSubmission({ agentId: "a2" });
    const votes = [
      makeVote({ submissionId: s1.id, score: 1, weight: 1 }),
      makeVote({ submissionId: s2.id, score: 1, weight: 10 }),
    ];
    const result = weightedVoteSimple(makeInput({
      job: voteJob("WEIGHTED_VOTE_SIMPLE"),
      submissions: [s1, s2],
      votes,
    }));
    expect(result.winners).toEqual(["a2"]);
  });

  it("tie-break by earliest submission", () => {
    const s1 = makeSubmission({ agentId: "a1", submittedAt: "2026-01-01T08:00:00Z" });
    const s2 = makeSubmission({ agentId: "a2", submittedAt: "2026-01-01T09:00:00Z" });
    const votes = [
      makeVote({ submissionId: s1.id, score: 1, weight: 1 }),
      makeVote({ submissionId: s2.id, score: 1, weight: 1 }),
    ];
    const result = weightedVoteSimple(makeInput({
      job: voteJob("WEIGHTED_VOTE_SIMPLE"),
      submissions: [s1, s2],
      votes,
    }));
    expect(result.winners).toEqual(["a1"]);
  });
});

describe("weightedReputation", () => {
  it("uses reputation function as weight", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const s2 = makeSubmission({ agentId: "a2" });
    const votes = [
      makeVote({ submissionId: s1.id, score: 1, agentId: "low-rep" }),
      makeVote({ submissionId: s2.id, score: 1, agentId: "high-rep" }),
    ];
    const result = weightedReputation(makeInput({
      job: voteJob("WEIGHTED_REPUTATION"),
      submissions: [s1, s2],
      votes,
      reputation: (id: string) => id === "high-rep" ? 100 : 10,
    }));
    expect(result.winners).toEqual(["a2"]);
  });

  it("returns empty when no submissions", () => {
    const result = weightedReputation(makeInput({ job: voteJob("WEIGHTED_REPUTATION") }));
    expect(result.winners).toEqual([]);
  });

  it("single submission wins trivially", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const votes = [makeVote({ submissionId: s1.id, score: 1, agentId: "v1" })];
    const result = weightedReputation(makeInput({
      job: voteJob("WEIGHTED_REPUTATION"),
      submissions: [s1],
      votes,
    }));
    expect(result.winners).toEqual(["a1"]);
  });
});
