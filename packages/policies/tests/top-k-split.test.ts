import { describe, it, expect } from "vitest";
import { topKSplit } from "../src/index.js";
import { makeJob, makeSubmission, makeVote, makeInput } from "./helpers.js";

function topKJob(topK = 2, ordering = "confidence") {
  return makeJob({ consensusPolicy: { type: "TOP_K_SPLIT", topK, ordering } });
}

describe("topKSplit", () => {
  it("returns empty when no submissions", () => {
    const result = topKSplit(makeInput({
      job: topKJob(),
      submissions: [],
    }));
    expect(result.winners).toEqual([]);
    expect(result.consensusTrace.reason).toBe("no_submissions");
  });

  it("returns top K by confidence", () => {
    const s1 = makeSubmission({ agentId: "a1", confidence: 0.9 });
    const s2 = makeSubmission({ agentId: "a2", confidence: 0.7 });
    const s3 = makeSubmission({ agentId: "a3", confidence: 0.5 });
    const result = topKSplit(makeInput({
      job: topKJob(2, "confidence"),
      submissions: [s3, s1, s2],
    }));
    expect(result.winners).toEqual(["a1", "a2"]);
    expect(result.winningSubmissionIds).toHaveLength(2);
  });

  it("returns top K by score when ordering is score", () => {
    const s1 = makeSubmission({ agentId: "a1", confidence: 0.5 });
    const s2 = makeSubmission({ agentId: "a2", confidence: 0.9 });
    const result = topKSplit(makeInput({
      job: topKJob(1, "score"),
      submissions: [s1, s2],
      votes: [
        makeVote({ submissionId: s1.id, score: 5, weight: 1 }),
        makeVote({ submissionId: s2.id, score: 2, weight: 1 }),
      ],
    }));
    expect(result.winners).toEqual(["a1"]);
  });

  it("defaults topK to 2", () => {
    const s1 = makeSubmission({ agentId: "a1", confidence: 0.9 });
    const s2 = makeSubmission({ agentId: "a2", confidence: 0.8 });
    const s3 = makeSubmission({ agentId: "a3", confidence: 0.7 });
    const result = topKSplit(makeInput({
      job: makeJob({ consensusPolicy: { type: "TOP_K_SPLIT" } }),
      submissions: [s1, s2, s3],
    }));
    expect(result.winners).toHaveLength(2);
  });

  it("uses first artifact as finalArtifact", () => {
    const s1 = makeSubmission({ agentId: "a1", confidence: 0.9, artifacts: { answer: "yes" } });
    const s2 = makeSubmission({ agentId: "a2", confidence: 0.5 });
    const result = topKSplit(makeInput({
      job: topKJob(1),
      submissions: [s1, s2],
    }));
    expect(result.finalArtifact).toEqual({ answer: "yes" });
  });
});
