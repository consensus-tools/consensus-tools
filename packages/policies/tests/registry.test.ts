import { describe, it, expect } from "vitest";
import { createPolicyRegistry, createRegistryResolver } from "../src/registry.js";
import { ownerPick } from "../src/owner-pick.js";
import { trustedArbiter } from "../src/trusted-arbiter.js";
import { topKSplit } from "../src/top-k-split.js";
import { makeJob, makeSubmission, makeInput } from "./helpers.js";

describe("createPolicyRegistry", () => {
  it("returns a Map with 9 entries", () => {
    const reg = createPolicyRegistry();
    expect(reg.size).toBe(9);
  });

  it("contains all 9 policy types", () => {
    const reg = createPolicyRegistry();
    const expected = [
      "FIRST_SUBMISSION_WINS", "HIGHEST_CONFIDENCE_SINGLE", "APPROVAL_VOTE",
      "OWNER_PICK", "TRUSTED_ARBITER", "TOP_K_SPLIT",
      "MAJORITY_VOTE", "WEIGHTED_VOTE_SIMPLE", "WEIGHTED_REPUTATION",
    ];
    for (const key of expected) {
      expect(reg.has(key as any)).toBe(true);
      expect(typeof reg.get(key as any)).toBe("function");
    }
  });
});

describe("createRegistryResolver", () => {
  it("dispatches to the correct policy", () => {
    const resolver = createRegistryResolver();
    const s1 = makeSubmission({ agentId: "a1", submittedAt: "2026-01-01T00:00:00Z" });
    const result = resolver(makeInput({
      job: makeJob({ consensusPolicy: { type: "FIRST_SUBMISSION_WINS" } }),
      submissions: [s1],
    }));
    expect(result.winners).toEqual(["a1"]);
  });

  it("throws for unknown policy type", () => {
    const resolver = createRegistryResolver();
    expect(() =>
      resolver(makeInput({
        job: makeJob({ consensusPolicy: { type: "NONEXISTENT" as any } }),
      }))
    ).toThrow("Unknown consensus policy");
  });
});

describe("ownerPick", () => {
  it("returns manual winners when provided", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const result = ownerPick(makeInput({
      submissions: [s1],
      manualWinnerAgentIds: ["a1"],
      manualSubmissionId: s1.id,
    }));
    expect(result.winners).toEqual(["a1"]);
    expect(result.finalArtifact).toEqual(s1.artifacts);
  });

  it("returns empty when no owner selection", () => {
    const result = ownerPick(makeInput());
    expect(result.winners).toEqual([]);
    expect(result.consensusTrace.reason).toBe("no_owner_selection");
  });
});

describe("trustedArbiter", () => {
  it("returns manual winners when provided", () => {
    const s1 = makeSubmission({ agentId: "a1" });
    const result = trustedArbiter(makeInput({
      submissions: [s1],
      manualWinnerAgentIds: ["a1"],
      manualSubmissionId: s1.id,
    }));
    expect(result.winners).toEqual(["a1"]);
  });

  it("returns awaiting_arbiter when no manual selection", () => {
    const result = trustedArbiter(makeInput());
    expect(result.winners).toEqual([]);
    expect(result.consensusTrace.mode).toBe("awaiting_arbiter");
  });
});

describe("topKSplit", () => {
  it("returns empty when no submissions", () => {
    const result = topKSplit(makeInput({
      job: makeJob({ consensusPolicy: { type: "TOP_K_SPLIT" } }),
    }));
    expect(result.winners).toEqual([]);
  });

  it("picks top K by confidence", () => {
    const s1 = makeSubmission({ agentId: "a1", confidence: 0.9 });
    const s2 = makeSubmission({ agentId: "a2", confidence: 0.7 });
    const s3 = makeSubmission({ agentId: "a3", confidence: 0.5 });
    const result = topKSplit(makeInput({
      job: makeJob({ consensusPolicy: { type: "TOP_K_SPLIT", topK: 2 } }),
      submissions: [s1, s2, s3],
    }));
    expect(result.winners).toEqual(["a1", "a2"]);
    expect(result.winningSubmissionIds).toHaveLength(2);
  });
});
