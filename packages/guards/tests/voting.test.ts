import { describe, it, expect } from "vitest";
import type { WeightedGuardVote } from "@consensus-tools/schemas";
import { computeEffectiveWeight, tallyVotes, reachesQuorum } from "../src/voting.js";

function makeVote(
  vote: "YES" | "NO" | "REWRITE",
  weight = 1,
  confidence = 1,
  reputation = 100,
  risk = 0.5,
): WeightedGuardVote {
  return { evaluator: "test", vote, reason: `Vote ${vote}`, risk, weight, confidence, reputation };
}

describe("computeEffectiveWeight", () => {
  it("static mode returns raw weight", () => {
    expect(computeEffectiveWeight(3, 50, "static")).toBe(3);
  });

  it("reputation mode returns reputation/100", () => {
    expect(computeEffectiveWeight(3, 80, "reputation")).toBe(0.8);
  });

  it("hybrid mode returns weight * (reputation/100)", () => {
    expect(computeEffectiveWeight(2, 50, "hybrid")).toBe(1);
  });

  it("defaults to hybrid mode", () => {
    expect(computeEffectiveWeight(2, 50)).toBe(1);
  });
});

describe("tallyVotes", () => {
  it("tallies all YES votes", () => {
    const tally = tallyVotes([makeVote("YES"), makeVote("YES")], "static");
    expect(tally.yes).toBe(2);
    expect(tally.no).toBe(0);
    expect(tally.rewrite).toBe(0);
    expect(tally.voterCount).toBe(2);
  });

  it("tallies mixed votes", () => {
    const tally = tallyVotes([makeVote("YES"), makeVote("NO"), makeVote("REWRITE")], "static");
    expect(tally.yes).toBe(1);
    expect(tally.no).toBe(1);
    expect(tally.rewrite).toBe(1);
    expect(tally.voterCount).toBe(3);
  });

  it("applies weights to weighted totals", () => {
    const tally = tallyVotes([makeVote("YES", 3), makeVote("NO", 2)], "static");
    expect(tally.weightedYes).toBe(3);
    expect(tally.weightedNo).toBe(2);
    expect(tally.totalWeight).toBe(5);
  });

  it("multiplies confidence into effective weight", () => {
    const tally = tallyVotes([makeVote("YES", 2, 0.5)], "static");
    expect(tally.weightedYes).toBe(1); // 2 * 0.5
    expect(tally.totalWeight).toBe(1);
  });

  it("handles empty votes", () => {
    const tally = tallyVotes([], "static");
    expect(tally.voterCount).toBe(0);
    expect(tally.totalWeight).toBe(0);
  });

  it("uses hybrid weighting by default", () => {
    const tally = tallyVotes([makeVote("YES", 2, 1, 50)]); // hybrid: 2 * 50/100 = 1
    expect(tally.weightedYes).toBe(1);
  });
});

describe("reachesQuorum", () => {
  it("returns true when weight meets quorum", () => {
    const tally = tallyVotes([makeVote("YES", 3), makeVote("YES", 2)], "static");
    expect(reachesQuorum(tally, 5)).toBe(true);
  });

  it("returns false when weight below quorum", () => {
    const tally = tallyVotes([makeVote("YES", 1)], "static");
    expect(reachesQuorum(tally, 5)).toBe(false);
  });

  it("returns false for empty votes", () => {
    const tally = tallyVotes([], "static");
    expect(reachesQuorum(tally, 1)).toBe(false);
  });

  it("returns true at exact quorum threshold", () => {
    const tally = tallyVotes([makeVote("YES", 2)], "static");
    expect(reachesQuorum(tally, 2)).toBe(true);
  });
});
