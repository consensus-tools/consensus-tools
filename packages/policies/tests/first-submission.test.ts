import { describe, it, expect } from "vitest";
import { firstSubmissionWins } from "../src/index.js";
import { makeJob, makeSubmission, makeInput } from "./helpers.js";

describe("firstSubmissionWins", () => {
  it("returns empty winners when no submissions", () => {
    const result = firstSubmissionWins(makeInput({ job: makeJob({ consensusPolicy: { type: "FIRST_SUBMISSION_WINS" } }) }));
    expect(result.winners).toEqual([]);
    expect(result.finalArtifact).toBeNull();
  });

  it("picks the earliest submission", () => {
    const s1 = makeSubmission({ agentId: "a1", submittedAt: "2026-01-01T10:00:00Z" });
    const s2 = makeSubmission({ agentId: "a2", submittedAt: "2026-01-01T09:00:00Z" });
    const result = firstSubmissionWins(makeInput({ submissions: [s1, s2] }));
    expect(result.winners).toEqual(["a2"]);
    expect(result.winningSubmissionIds).toEqual([s2.id]);
    expect(result.finalArtifact).toEqual(s2.artifacts);
  });

  it("single submission wins by default", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const result = firstSubmissionWins(makeInput({ submissions: [s1] }));
    expect(result.winners).toEqual(["a1"]);
  });
});
