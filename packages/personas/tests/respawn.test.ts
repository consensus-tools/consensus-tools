import { describe, it, expect } from "vitest";
import { buildLearningSummary, mutatePersona } from "../src/respawn.js";
import type { PersonaConfig, LearningSummary } from "../src/types.js";

describe("buildLearningSummary", () => {
  it("returns empty summary for no decisions", () => {
    const result = buildLearningSummary("p1", []);
    expect(result.source_decisions).toBe(0);
    expect(result.mistake_patterns).toEqual([]);
  });

  it("detects high-confidence misalignment", () => {
    const decisions = [
      {
        final_decision: "ALLOW",
        votes: [{ persona_id: "p1", vote: "NO", confidence: 0.9, red_flags: [] }],
      },
    ];
    const result = buildLearningSummary("p1", decisions);
    expect(result.source_decisions).toBe(1);
    expect(result.mistake_patterns).toContain("high_confidence_mismatch:1");
  });

  it("tracks red flags", () => {
    const decisions = [
      {
        final_decision: "ALLOW",
        votes: [{ persona_id: "p1", vote: "YES", confidence: 0.5, red_flags: ["data_leak"] }],
      },
    ];
    const result = buildLearningSummary("p1", decisions);
    expect(result.mistake_patterns).toContain("red_flag:data_leak:1");
  });

  it("skips decisions without matching persona", () => {
    const decisions = [
      {
        final_decision: "ALLOW",
        votes: [{ persona_id: "other", vote: "YES", confidence: 0.9, red_flags: [] }],
      },
    ];
    const result = buildLearningSummary("p1", decisions);
    expect(result.source_decisions).toBe(0);
  });
});

describe("mutatePersona", () => {
  const base: PersonaConfig = {
    id: "p1",
    name: "Test Agent",
    role: "security",
    reputation: 0.1,
    bias: "cautious",
    non_negotiables: ["Auth required"],
    failure_modes: ["false positives"],
  };

  it("creates a new persona with v2 name", () => {
    const learning: LearningSummary = { source_decisions: 5, mistake_patterns: ["high_confidence_mismatch:3"] };
    const result = mutatePersona(base, learning);
    expect(result.name).toBe("Test Agent v2");
    expect(result.id).not.toBe(base.id);
  });

  it("resets reputation to 0.55", () => {
    const learning: LearningSummary = { source_decisions: 0, mistake_patterns: [] };
    const result = mutatePersona(base, learning);
    expect(result.reputation).toBe(0.55);
  });

  it("incorporates learning into bias", () => {
    const learning: LearningSummary = { source_decisions: 5, mistake_patterns: ["high_confidence_mismatch:3"] };
    const result = mutatePersona(base, learning);
    expect(result.bias).toContain("high_confidence_mismatch");
  });

  it("adds validation non-negotiable", () => {
    const learning: LearningSummary = { source_decisions: 0, mistake_patterns: [] };
    const result = mutatePersona(base, learning);
    expect(result.non_negotiables).toContain("Auth required");
    expect(result.non_negotiables).toContain("Validate high-confidence disagreement");
  });

  it("preserves role", () => {
    const learning: LearningSummary = { source_decisions: 0, mistake_patterns: [] };
    const result = mutatePersona(base, learning);
    expect(result.role).toBe("security");
  });
});
