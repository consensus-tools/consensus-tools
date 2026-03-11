import { describe, it, expect } from "vitest";
import { highestConfidenceSingle } from "../src/highest-confidence-single.js";
import { makeJob, makeSubmission, makeInput } from "./helpers.js";

describe("highestConfidenceSingle", () => {
  it("returns empty winners when no submissions", () => {
    const result = highestConfidenceSingle(makeInput({
      job: makeJob({ consensusPolicy: { type: "HIGHEST_CONFIDENCE_SINGLE" } }),
    }));
    expect(result.winners).toEqual([]);
  });

  it("picks highest confidence submission", () => {
    const s1 = makeSubmission({ agentId: "a1", confidence: 0.5 });
    const s2 = makeSubmission({ agentId: "a2", confidence: 0.9 });
    const s3 = makeSubmission({ agentId: "a3", confidence: 0.7 });
    const result = highestConfidenceSingle(makeInput({
      job: makeJob({ consensusPolicy: { type: "HIGHEST_CONFIDENCE_SINGLE" } }),
      submissions: [s1, s2, s3],
    }));
    expect(result.winners).toEqual(["a2"]);
  });

  it("filters by minConfidence", () => {
    const s1 = makeSubmission({ agentId: "a1", confidence: 0.5 });
    const s2 = makeSubmission({ agentId: "a2", confidence: 0.9 });
    const result = highestConfidenceSingle(makeInput({
      job: makeJob({ consensusPolicy: { type: "HIGHEST_CONFIDENCE_SINGLE", minConfidence: 0.8 } }),
      submissions: [s1, s2],
    }));
    expect(result.winners).toEqual(["a2"]);
    expect(result.winningSubmissionIds).toEqual([s2.id]);
  });

  it("returns empty when no submission meets minConfidence", () => {
    const s1 = makeSubmission({ agentId: "a1", confidence: 0.3 });
    const result = highestConfidenceSingle(makeInput({
      job: makeJob({ consensusPolicy: { type: "HIGHEST_CONFIDENCE_SINGLE", minConfidence: 0.8 } }),
      submissions: [s1],
    }));
    expect(result.winners).toEqual([]);
    expect(result.consensusTrace.reason).toBe("min_confidence_not_met");
  });
});
