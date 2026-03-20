import { describe, it, expect } from "vitest";
import { updateReputation, DEFAULT_RULESET } from "../src/reputation.js";
import type { PersonaConfig, ReputationRuleset } from "../src/types.js";

function makePersonas(): PersonaConfig[] {
  return [
    { id: "p1", name: "Alice", role: "security", reputation: 0.5 },
    { id: "p2", name: "Bob", role: "compliance", reputation: 0.5 },
  ];
}

describe("updateReputation", () => {
  it("rewards aligned YES votes when decision is ALLOW", () => {
    const result = updateReputation(
      [{ persona_id: "p1", vote: "YES", confidence: 0.7 }],
      "ALLOW",
      makePersonas(),
    );
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]!.delta).toBe(0.02);
    expect(result.changes[0]!.reputation_after).toBe(0.52);
  });

  it("penalizes misaligned YES votes when decision is BLOCK", () => {
    const result = updateReputation(
      [{ persona_id: "p1", vote: "YES", confidence: 0.5 }],
      "BLOCK",
      makePersonas(),
    );
    expect(result.changes[0]!.delta).toBe(-0.03);
    expect(result.changes[0]!.reputation_after).toBe(0.47);
  });

  it("applies extra penalty for high-confidence misalignment", () => {
    const result = updateReputation(
      [{ persona_id: "p1", vote: "YES", confidence: 0.85 }],
      "BLOCK",
      makePersonas(),
    );
    expect(result.changes[0]!.delta).toBe(-0.05);
    expect(result.changes[0]!.reputation_after).toBe(0.45);
  });

  it("clamps reputation to minRep", () => {
    const personas = [{ id: "p1", name: "A", role: "r", reputation: 0.06 }];
    const result = updateReputation(
      [{ persona_id: "p1", vote: "YES", confidence: 0.9 }],
      "BLOCK",
      personas,
    );
    expect(result.changes[0]!.reputation_after).toBe(0.05);
  });

  it("clamps reputation to maxRep", () => {
    const personas = [{ id: "p1", name: "A", role: "r", reputation: 0.94 }];
    const result = updateReputation(
      [{ persona_id: "p1", vote: "YES", confidence: 0.7 }],
      "ALLOW",
      personas,
    );
    expect(result.changes[0]!.reputation_after).toBe(0.95);
  });

  it("skips votes for unknown persona_ids", () => {
    const result = updateReputation(
      [{ persona_id: "unknown", vote: "YES", confidence: 0.7 }],
      "ALLOW",
      makePersonas(),
    );
    expect(result.changes).toHaveLength(0);
  });

  it("handles empty votes array", () => {
    const result = updateReputation([], "ALLOW", makePersonas());
    expect(result.changes).toHaveLength(0);
  });

  it("handles REWRITE alignment", () => {
    const result = updateReputation(
      [{ persona_id: "p1", vote: "REWRITE", confidence: 0.7 }],
      "REQUIRE_REWRITE",
      makePersonas(),
    );
    expect(result.changes[0]!.delta).toBe(0.02);
  });

  it("processes multiple votes in one batch", () => {
    const result = updateReputation(
      [
        { persona_id: "p1", vote: "YES", confidence: 0.7 },
        { persona_id: "p2", vote: "NO", confidence: 0.7 },
      ],
      "ALLOW",
      makePersonas(),
    );
    expect(result.changes).toHaveLength(2);
    expect(result.changes[0]!.delta).toBe(0.02);  // p1 aligned
    expect(result.changes[1]!.delta).toBe(-0.03); // p2 misaligned
  });

  it("accepts custom ruleset", () => {
    const rules: ReputationRuleset = {
      rewardAligned: 0.1,
      penalizeMisaligned: -0.1,
      highConfidencePenaltyBoost: -0.05,
      minRep: 0,
      maxRep: 1,
    };
    const result = updateReputation(
      [{ persona_id: "p1", vote: "YES", confidence: 0.7 }],
      "ALLOW",
      makePersonas(),
      rules,
    );
    expect(result.changes[0]!.delta).toBe(0.1);
  });

  it("exports DEFAULT_RULESET", () => {
    expect(DEFAULT_RULESET.rewardAligned).toBe(0.02);
    expect(DEFAULT_RULESET.penalizeMisaligned).toBe(-0.03);
    expect(DEFAULT_RULESET.highConfidencePenaltyBoost).toBe(-0.02);
    expect(DEFAULT_RULESET.minRep).toBe(0.05);
    expect(DEFAULT_RULESET.maxRep).toBe(0.95);
  });
});
