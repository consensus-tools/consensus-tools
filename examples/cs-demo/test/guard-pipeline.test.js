import { describe, it, expect } from "vitest";
import { TIER_CONFIG } from "../lib/guard-pipeline.js";

describe("Guard Pipeline", () => {
  it("TIER_CONFIG has all 4 tiers", () => {
    expect(Object.keys(TIER_CONFIG)).toEqual(["low", "medium", "high", "critical"]);
  });

  it("Low tier uses 2 guards", () => {
    expect(TIER_CONFIG.low.count).toBe(2);
  });

  it("Medium tier uses 3 guards", () => {
    expect(TIER_CONFIG.medium.count).toBe(3);
  });

  it("High tier uses 4 guards", () => {
    expect(TIER_CONFIG.high.count).toBe(4);
  });

  it("Critical tier uses 5 guards", () => {
    expect(TIER_CONFIG.critical.count).toBe(5);
  });

  it("higher tiers have lower risk thresholds (stricter)", () => {
    expect(TIER_CONFIG.low.riskThreshold).toBeGreaterThan(TIER_CONFIG.medium.riskThreshold);
    expect(TIER_CONFIG.medium.riskThreshold).toBeGreaterThan(TIER_CONFIG.high.riskThreshold);
    expect(TIER_CONFIG.high.riskThreshold).toBeGreaterThan(TIER_CONFIG.critical.riskThreshold);
  });

  it("higher tiers have lower quorum (harder to pass)", () => {
    expect(TIER_CONFIG.low.quorum).toBeGreaterThan(TIER_CONFIG.critical.quorum);
  });
});
