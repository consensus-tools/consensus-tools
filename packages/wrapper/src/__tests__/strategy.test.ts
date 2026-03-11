import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregateScores } from "../strategy.js";
import type { ReviewResult, StrategyConfig } from "../types.js";

describe("aggregateScores", () => {
  // ── threshold strategy ──────────────────────────────────────────────

  describe("threshold strategy", () => {
    const config: StrategyConfig = { strategy: "threshold", threshold: 0.5 };

    it("allows when average score meets threshold", () => {
      const scores: ReviewResult[] = [
        { score: 0.8 },
        { score: 0.6 },
      ];
      const result = aggregateScores(scores, "out", 1, config, 2);
      assert.equal(result.action, "allow");
      assert.equal(result.aggregateScore, 0.7);
      assert.equal(result.output, "out");
      assert.equal(result.attempt, 1);
    });

    it("retries when average below threshold and retries remain", () => {
      const scores: ReviewResult[] = [
        { score: 0.2 },
        { score: 0.3 },
      ];
      const result = aggregateScores(scores, "out", 1, config, 2);
      assert.equal(result.action, "retry");
    });

    it("retries on last retry attempt", () => {
      const scores: ReviewResult[] = [
        { score: 0.2 },
        { score: 0.3 },
      ];
      const result = aggregateScores(scores, "out", 2, config, 2);
      assert.equal(result.action, "retry");
    });

    it("escalates when past all retries", () => {
      const scores: ReviewResult[] = [
        { score: 0.2 },
        { score: 0.3 },
      ];
      const result = aggregateScores(scores, "out", 3, config, 2);
      assert.equal(result.action, "escalate");
    });

    it("allows when average equals threshold exactly", () => {
      const scores: ReviewResult[] = [
        { score: 0.4 },
        { score: 0.6 },
      ];
      const result = aggregateScores(scores, "out", 1, config, 1);
      assert.equal(result.action, "allow");
    });

    it("uses default threshold of 0.5 when none specified", () => {
      const noThreshold: StrategyConfig = { strategy: "threshold" };
      const scores: ReviewResult[] = [{ score: 0.6 }];
      const result = aggregateScores(scores, "out", 1, noThreshold, 1);
      assert.equal(result.action, "allow");
    });

    it("uses custom threshold", () => {
      const high: StrategyConfig = { strategy: "threshold", threshold: 0.9 };
      const scores: ReviewResult[] = [{ score: 0.85 }];
      // attempt 1 <= maxRetries 1 → retry
      const result = aggregateScores(scores, "out", 1, high, 1);
      assert.equal(result.action, "retry");
    });

    it("escalates with custom threshold when no retries left", () => {
      const high: StrategyConfig = { strategy: "threshold", threshold: 0.9 };
      const scores: ReviewResult[] = [{ score: 0.85 }];
      const result = aggregateScores(scores, "out", 2, high, 1);
      assert.equal(result.action, "escalate");
    });
  });

  // ── unanimous strategy ──────────────────────────────────────────────

  describe("unanimous strategy", () => {
    const config: StrategyConfig = { strategy: "unanimous", threshold: 0.5 };

    it("allows when all reviewers score above threshold", () => {
      const scores: ReviewResult[] = [
        { score: 0.9 },
        { score: 0.7 },
        { score: 0.6 },
      ];
      const result = aggregateScores(scores, "out", 1, config, 1);
      assert.equal(result.action, "allow");
    });

    it("fails when any reviewer scores below threshold", () => {
      const scores: ReviewResult[] = [
        { score: 0.9 },
        { score: 0.3 },
        { score: 0.7 },
      ];
      const result = aggregateScores(scores, "out", 1, config, 2);
      assert.equal(result.action, "retry");
    });

    it("escalates when unanimous fails and no retries left", () => {
      const scores: ReviewResult[] = [
        { score: 0.9 },
        { score: 0.3 },
      ];
      const result = aggregateScores(scores, "out", 3, config, 2);
      assert.equal(result.action, "escalate");
    });
  });

  // ── majority strategy ───────────────────────────────────────────────

  describe("majority strategy", () => {
    const config: StrategyConfig = { strategy: "majority", threshold: 0.5 };

    it("allows when majority of reviewers score above threshold", () => {
      const scores: ReviewResult[] = [
        { score: 0.8 },
        { score: 0.7 },
        { score: 0.2 },
      ];
      const result = aggregateScores(scores, "out", 1, config, 1);
      assert.equal(result.action, "allow");
    });

    it("fails when majority scores below threshold", () => {
      const scores: ReviewResult[] = [
        { score: 0.8 },
        { score: 0.2 },
        { score: 0.3 },
      ];
      const result = aggregateScores(scores, "out", 1, config, 2);
      assert.equal(result.action, "retry");
    });

    it("fails when exactly half score above (need strictly more than half)", () => {
      const scores: ReviewResult[] = [
        { score: 0.8 },
        { score: 0.2 },
      ];
      const result = aggregateScores(scores, "out", 3, config, 2);
      assert.equal(result.action, "escalate");
    });
  });

  // ── block behavior ──────────────────────────────────────────────────

  describe("block flag", () => {
    it("blocks when any reviewer sets block: true, even with high scores", () => {
      const scores: ReviewResult[] = [
        { score: 1.0 },
        { score: 0.9, block: true },
      ];
      const config: StrategyConfig = { strategy: "threshold", threshold: 0.5 };
      const result = aggregateScores(scores, "out", 1, config, 5);
      assert.equal(result.action, "block");
      assert.equal(result.aggregateScore, 0);
    });

    it("blocks override all strategies", () => {
      const scores: ReviewResult[] = [
        { score: 1.0, block: true },
      ];
      for (const strategy of ["threshold", "unanimous", "majority"] as const) {
        const result = aggregateScores(scores, "out", 1, { strategy }, 5);
        assert.equal(result.action, "block", `${strategy} should be blocked`);
      }
    });
  });

  // ── edge cases ──────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles empty scores array (avg = 0) — retries if possible", () => {
      const config: StrategyConfig = { strategy: "threshold", threshold: 0.5 };
      const result = aggregateScores([], "out", 1, config, 1);
      assert.equal(result.action, "retry");
      assert.equal(result.aggregateScore, 0);
    });

    it("handles empty scores array — escalates when no retries left", () => {
      const config: StrategyConfig = { strategy: "threshold", threshold: 0.5 };
      const result = aggregateScores([], "out", 2, config, 1);
      assert.equal(result.action, "escalate");
      assert.equal(result.aggregateScore, 0);
    });

    it("empty scores with threshold 0 allows", () => {
      const config: StrategyConfig = { strategy: "threshold", threshold: 0 };
      const result = aggregateScores([], "out", 1, config, 1);
      assert.equal(result.action, "allow");
    });

    it("preserves output and attempt in result", () => {
      const config: StrategyConfig = { strategy: "threshold", threshold: 0.5 };
      const scores: ReviewResult[] = [{ score: 0.8 }];
      const result = aggregateScores(scores, { data: 42 }, 3, config, 5);
      assert.deepEqual(result.output, { data: 42 });
      assert.equal(result.attempt, 3);
      assert.deepEqual(result.scores, scores);
    });

    it("includes rationale in returned scores", () => {
      const config: StrategyConfig = { strategy: "threshold", threshold: 0.5 };
      const scores: ReviewResult[] = [
        { score: 0.9, rationale: "looks good" },
      ];
      const result = aggregateScores(scores, "out", 1, config, 1);
      assert.equal(result.scores[0]?.rationale, "looks good");
    });
  });
});
