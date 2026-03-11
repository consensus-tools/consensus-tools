import type { ConsensusOptions, DecisionResult, ReviewResult, StrategyConfig } from "./types.js";
import { aggregateScores } from "./strategy.js";

/**
 * Wraps a function with a consensus gate.
 *
 * The function is called, its output reviewed by all reviewers, and
 * the strategy determines whether to allow, block, retry, or escalate.
 *
 * @returns A wrapped function with the same signature.
 */
export function consensus<T>(opts: ConsensusOptions<T>): (...args: unknown[]) => Promise<DecisionResult<T>> {
  const { fn, reviewers, hooks, maxRetries = 1 } = opts;
  const strategyConfig: StrategyConfig = opts.strategy ?? { strategy: "threshold", threshold: 0.5 };

  return async (...args: unknown[]): Promise<DecisionResult<T>> => {
    let attempt = 0;

    while (attempt < maxRetries + 1) {
      attempt++;

      await hooks?.beforeSubmit?.(args);

      const output = await fn(...args);

      const scores: ReviewResult[] = await Promise.all(
        reviewers.map((reviewer) =>
          reviewer(output, { name: opts.name, args, attempt }),
        ),
      );

      const finalDecision = aggregateScores(scores, output, attempt, strategyConfig, maxRetries);

      if (finalDecision.action === "allow") {
        await hooks?.afterResolve?.(finalDecision);
        return finalDecision;
      }

      if (finalDecision.action === "block") {
        await hooks?.onBlock?.(finalDecision);
        return finalDecision;
      }

      if (finalDecision.action === "escalate") {
        await hooks?.onEscalate?.(finalDecision);
        return finalDecision;
      }

      // action === "retry" — continue loop
    }

    // Should not reach here, but escalate if it does
    return { action: "escalate", output: null, scores: [], aggregateScore: 0, attempt };
  };
}
