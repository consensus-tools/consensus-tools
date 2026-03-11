import type { ReviewResult, StrategyConfig, DecisionResult } from "./types.js";

/**
 * Aggregate reviewer scores according to a strategy.
 * Returns the decision action and aggregate score.
 */
export function aggregateScores<T>(
  scores: ReviewResult[],
  output: T,
  attempt: number,
  config: StrategyConfig,
  maxRetries: number,
): DecisionResult<T> {
  if (scores.some((s) => s.block)) {
    return { action: "block", output, scores, aggregateScore: 0, attempt };
  }

  const avg = scores.length ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length : 0;

  const passed = (() => {
    switch (config.strategy) {
      case "unanimous":
        return scores.every((s) => s.score >= (config.threshold ?? 0.5));
      case "majority":
        return scores.filter((s) => s.score >= (config.threshold ?? 0.5)).length > scores.length / 2;
      case "threshold":
      default:
        return avg >= (config.threshold ?? 0.5);
    }
  })();

  if (passed) {
    return { action: "allow", output, scores, aggregateScore: avg, attempt };
  }

  if (attempt < maxRetries) {
    return { action: "retry", output, scores, aggregateScore: avg, attempt };
  }

  return { action: "escalate", output, scores, aggregateScore: avg, attempt };
}
