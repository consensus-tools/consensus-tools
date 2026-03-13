import { describe, it, expect } from "vitest";
import { trustedArbiter } from "../src/index.js";
import { makeJob, makeSubmission, makeInput } from "./helpers.js";

describe("trustedArbiter", () => {
  it("returns manual winners when provided", () => {
    const s1 = makeSubmission({ agentId: "arbiter-pick" });
    const result = trustedArbiter(makeInput({
      job: makeJob({ consensusPolicy: { type: "TRUSTED_ARBITER" } }),
      submissions: [s1],
      manualWinnerAgentIds: ["arbiter-pick"],
      manualSubmissionId: s1.id,
    }));
    expect(result.winners).toEqual(["arbiter-pick"]);
    expect(result.winningSubmissionIds).toEqual([s1.id]);
    expect(result.consensusTrace.mode).toBe("manual");
    expect(result.finalArtifact).toEqual(s1.artifacts);
  });

  it("returns awaiting_arbiter when no manual winners", () => {
    const result = trustedArbiter(makeInput({
      job: makeJob({ consensusPolicy: { type: "TRUSTED_ARBITER" } }),
    }));
    expect(result.winners).toEqual([]);
    expect(result.consensusTrace.reason).toBe("awaiting_arbiter");
    expect(result.finalArtifact).toBeNull();
  });

  it("supports multiple manual winners", () => {
    const result = trustedArbiter(makeInput({
      job: makeJob({ consensusPolicy: { type: "TRUSTED_ARBITER" } }),
      manualWinnerAgentIds: ["a1", "a2"],
    }));
    expect(result.winners).toEqual(["a1", "a2"]);
  });
});
