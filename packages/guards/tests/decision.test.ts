import { describe, it, expect } from "vitest";
import type { GuardVote, GuardPolicy, WeightedGuardVote } from "@consensus-tools/schemas";
import { finalizeVotes, computeDecision, normalizeGuardType } from "../src/decision.js";

const defaultPolicy: GuardPolicy = {
  policyId: "test-policy",
  quorum: 0.6,
  riskThreshold: 0.7,
  hitlRequiredAboveRisk: 0.8,
};

function makeWeightedVote(
  vote: "YES" | "NO" | "REWRITE",
  risk = 0.5,
  weight = 1,
  confidence = 1,
  reputation = 100,
): WeightedGuardVote {
  return { evaluator: "test", vote, reason: `Vote ${vote}`, risk, weight, confidence, reputation };
}

describe("finalizeVotes", () => {
  it("NO vote → BLOCK", () => {
    const votes: GuardVote[] = [{ evaluator: "test", vote: "NO", reason: "Blocked", risk: 0.9 }];
    const result = finalizeVotes(votes, "send_email");
    expect(result.decision).toBe("BLOCK");
    expect(result.risk_score).toBe(0.9);
  });

  it("YES vote → ALLOW", () => {
    const votes: GuardVote[] = [{ evaluator: "test", vote: "YES", reason: "Safe", risk: 0.1 }];
    const result = finalizeVotes(votes, "send_email");
    expect(result.decision).toBe("ALLOW");
  });

  it("empty votes → ALLOW with risk 0", () => {
    const result = finalizeVotes([], "send_email");
    expect(result.decision).toBe("ALLOW");
    expect(result.risk_score).toBe(0);
  });

  it("REWRITE on code_merge → REQUIRE_HUMAN (no policy)", () => {
    const votes: GuardVote[] = [{ evaluator: "test", vote: "REWRITE", reason: "Sensitive", risk: 0.82 }];
    const result = finalizeVotes(votes, "code_merge");
    expect(result.decision).toBe("REQUIRE_HUMAN");
    expect(result.next_step?.tool).toBe("human.approve");
  });

  it("REWRITE on non-code_merge → REWRITE (no policy)", () => {
    const votes: GuardVote[] = [{ evaluator: "test", vote: "REWRITE", reason: "Profanity", risk: 0.75 }];
    const result = finalizeVotes(votes, "publish");
    expect(result.decision).toBe("REWRITE");
    expect(result.suggested_rewrite).toBeDefined();
  });

  it("REWRITE with policy risk >= hitlRequiredAboveRisk → REQUIRE_HUMAN", () => {
    const votes: GuardVote[] = [{ evaluator: "test", vote: "REWRITE", reason: "High risk", risk: 0.85 }];
    const result = finalizeVotes(votes, "publish", defaultPolicy);
    expect(result.decision).toBe("REQUIRE_HUMAN");
  });

  it("REWRITE with policy risk < hitlRequiredAboveRisk → REWRITE", () => {
    const votes: GuardVote[] = [{ evaluator: "test", vote: "REWRITE", reason: "Low risk", risk: 0.5 }];
    const result = finalizeVotes(votes, "publish", defaultPolicy);
    expect(result.decision).toBe("REWRITE");
  });
});

describe("computeDecision", () => {
  it("ALLOW when all YES and quorum met", () => {
    const votes = [makeWeightedVote("YES", 0.2), makeWeightedVote("YES", 0.3)];
    const result = computeDecision(votes, defaultPolicy, "static");
    expect(result.decision).toBe("ALLOW");
    expect(result.quorumMet).toBe(true);
  });

  it("BLOCK when high risk and NO votes", () => {
    const votes = [makeWeightedVote("NO", 0.9), makeWeightedVote("YES", 0.8)];
    const result = computeDecision(votes, defaultPolicy, "static");
    expect(result.decision).toBe("BLOCK");
  });

  it("REQUIRE_HUMAN when quorum not met", () => {
    const votes = [makeWeightedVote("YES", 0.3, 0.3)];
    const result = computeDecision(votes, defaultPolicy, "static");
    expect(result.decision).toBe("REQUIRE_HUMAN");
  });

  it("REWRITE when majority REWRITE, high risk, no NOs", () => {
    const votes = [
      makeWeightedVote("REWRITE", 0.85),
      makeWeightedVote("REWRITE", 0.8),
      makeWeightedVote("YES", 0.75),
    ];
    const result = computeDecision(votes, defaultPolicy, "static");
    expect(result.decision).toBe("REWRITE");
  });

  it("BLOCK when mix of NO and REWRITE with high risk", () => {
    const votes = [makeWeightedVote("NO", 0.9), makeWeightedVote("REWRITE", 0.85)];
    const result = computeDecision(votes, defaultPolicy, "static");
    expect(result.decision).toBe("BLOCK");
  });

  it("ALLOW with YES majority meeting quorum threshold", () => {
    const votes = [
      makeWeightedVote("YES", 0.2, 2),
      makeWeightedVote("YES", 0.3, 2),
      makeWeightedVote("REWRITE", 0.4, 1),
    ];
    const result = computeDecision(votes, defaultPolicy, "static");
    expect(result.decision).toBe("ALLOW");
    expect(result.weightedYesRatio).toBeGreaterThan(0.6);
  });

  it("returns correct combinedRisk as weighted average", () => {
    const votes = [
      makeWeightedVote("YES", 0.2, 1), // risk 0.2, weight 1
      makeWeightedVote("YES", 0.8, 3), // risk 0.8, weight 3
    ];
    const result = computeDecision(votes, { ...defaultPolicy, riskThreshold: 1 }, "static");
    // combinedRisk = (0.2*1 + 0.8*3) / (1+3) = 2.6/4 = 0.65
    expect(result.combinedRisk).toBeCloseTo(0.65, 2);
  });

  it("BLOCK when only REWRITE but minority ratio", () => {
    const votes = [
      makeWeightedVote("REWRITE", 0.9, 1),
      makeWeightedVote("YES", 0.8, 3),
    ];
    const result = computeDecision(votes, defaultPolicy, "static");
    // risk > threshold, no NOs, rewrite ratio 1/4 = 0.25 < 0.5 → BLOCK
    expect(result.decision).toBe("BLOCK");
  });

  it("REQUIRE_HUMAN when YES ratio below policy quorum", () => {
    const votes = [
      makeWeightedVote("YES", 0.2, 1),
      makeWeightedVote("REWRITE", 0.2, 2),
    ];
    const result = computeDecision(votes, defaultPolicy, "static");
    // risk = 0.2 (below threshold), quorum met (totalWeight=3>=0.6), but yesRatio = 1/3 = 0.33 < 0.6
    expect(result.decision).toBe("REQUIRE_HUMAN");
  });
});

describe("normalizeGuardType", () => {
  it("returns known types as-is", () => {
    expect(normalizeGuardType("send_email")).toBe("send_email");
    expect(normalizeGuardType("code_merge")).toBe("code_merge");
    expect(normalizeGuardType("deployment")).toBe("deployment");
  });

  it("defaults unknown types to agent_action", () => {
    expect(normalizeGuardType("unknown")).toBe("agent_action");
    expect(normalizeGuardType("")).toBe("agent_action");
  });
});
