import { describe, it, expect } from "vitest";
import { ownerPick } from "../src/index.js";
import { makeJob, makeSubmission, makeInput } from "./helpers.js";

describe("ownerPick", () => {
  it("returns manual winners when provided", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const result = ownerPick(makeInput({
      job: makeJob({ consensusPolicy: { type: "OWNER_PICK" } }),
      submissions: [s1],
      manualWinnerAgentIds: ["a1"],
      manualSubmissionId: s1.id,
    }));
    expect(result.winners).toEqual(["a1"]);
    expect(result.winningSubmissionIds).toEqual([s1.id]);
    expect(result.finalArtifact).toEqual(s1.artifacts);
  });

  it("returns no_owner_selection when no manual winners", () => {
    const result = ownerPick(makeInput({
      job: makeJob({ consensusPolicy: { type: "OWNER_PICK" } }),
    }));
    expect(result.winners).toEqual([]);
    expect(result.consensusTrace.reason).toBe("no_owner_selection");
  });

  it("returns empty winningSubmissionIds when no manualSubmissionId", () => {
    const result = ownerPick(makeInput({
      job: makeJob({ consensusPolicy: { type: "OWNER_PICK" } }),
      manualWinnerAgentIds: ["a1"],
    }));
    expect(result.winners).toEqual(["a1"]);
    expect(result.winningSubmissionIds).toEqual([]);
  });
});
