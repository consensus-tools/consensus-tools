import { describe, it, expect } from "vitest";
import {
  DEFAULTS,
  DEFAULT_GUARD,
  DEFAULT_POLICY,
  DEFAULT_PERSONA_COUNT,
  DEFAULT_PERSONA_TRIO,
  resolvePolicyType,
} from "../defaults.js";

describe("DEFAULTS", () => {
  it("provides full defaults matching expected values", () => {
    expect(DEFAULTS.policy).toBe("majority");
    // Default guards are the active persona trio so default config gets real evaluation.
    expect(DEFAULTS.guards).toEqual(["security", "compliance", "user-impact"]);
    expect(DEFAULTS.failPolicy).toBe("closed");
    expect(DEFAULTS.storage).toBe("memory");
    expect(DEFAULTS.logger).toBe(true);
  });

  it("exports expected guard and policy constants", () => {
    expect(DEFAULT_GUARD).toBe("agent_action");
    expect(DEFAULT_POLICY).toBe("majority");
    expect(DEFAULT_PERSONA_COUNT).toBe(3);
    expect(DEFAULT_PERSONA_TRIO).toEqual(["security", "compliance", "user-impact"]);
  });

  it("merges partial config with defaults", () => {
    const partial = { policy: "unanimous", failPolicy: "open" as const };
    const merged = { ...DEFAULTS, ...partial };
    expect(merged.policy).toBe("unanimous");
    expect(merged.failPolicy).toBe("open");
    // Untouched defaults remain
    expect(merged.guards).toEqual(["security", "compliance", "user-impact"]);
    expect(merged.storage).toBe("memory");
    expect(merged.logger).toBe(true);
  });
});

describe("resolvePolicyType", () => {
  it("maps 'majority' to MAJORITY_VOTE", () => {
    expect(resolvePolicyType("majority")).toBe("MAJORITY_VOTE");
  });

  it("maps 'supermajority' to APPROVAL_VOTE", () => {
    expect(resolvePolicyType("supermajority")).toBe("APPROVAL_VOTE");
  });

  it("maps 'unanimous' to APPROVAL_VOTE", () => {
    expect(resolvePolicyType("unanimous")).toBe("APPROVAL_VOTE");
  });

  it("maps 'threshold:0.8' to APPROVAL_VOTE", () => {
    expect(resolvePolicyType("threshold:0.8")).toBe("APPROVAL_VOTE");
  });

  it("passes core policy names through unchanged", () => {
    expect(resolvePolicyType("WEIGHTED_REPUTATION")).toBe("WEIGHTED_REPUTATION");
    expect(resolvePolicyType("FIRST_SUBMISSION_WINS")).toBe("FIRST_SUBMISSION_WINS");
  });

  it("falls back to MAJORITY_VOTE on unknown policy", () => {
    expect(resolvePolicyType("bogus")).toBe("MAJORITY_VOTE");
  });
});
