import { describe, it, expect } from "vitest";

// We can't test generateScenario without mocking ai-sdk,
// so we test the tier validation and structure.

describe("Scenario Generation", () => {
  it("TIER_CONFIG covers all expected tiers", async () => {
    const { TIER_CONFIG } = await import("../lib/guard-pipeline.js");
    const validTiers = ["low", "medium", "high", "critical"];
    for (const tier of validTiers) {
      expect(TIER_CONFIG[tier]).toBeDefined();
      expect(TIER_CONFIG[tier].count).toBeGreaterThanOrEqual(2);
      expect(TIER_CONFIG[tier].count).toBeLessThanOrEqual(5);
      expect(TIER_CONFIG[tier].riskThreshold).toBeGreaterThan(0);
      expect(TIER_CONFIG[tier].riskThreshold).toBeLessThanOrEqual(1);
    }
  });
});
