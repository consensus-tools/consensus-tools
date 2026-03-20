import { consensus } from "./consensus.js";
import type { ReviewerFn, StrategyConfig, LifecycleHooks, DecisionResult } from "./types.js";

/**
 * Wrapper template — reusable configuration for a consensus-gated function.
 *
 * Combines reviewers + strategy + hooks into a template that can wrap any
 * async function. The wrapped function runs, reviewers score the output,
 * and the strategy determines allow/block/retry/escalate.
 */

export interface WrapperTemplateConfig<T = unknown> {
  /** Reviewer functions that score the wrapped function's output. */
  reviewers: ReviewerFn<T>[];
  /** Voting strategy (threshold, majority, unanimous). */
  strategy: StrategyConfig;
  /** Lifecycle hooks. */
  hooks?: LifecycleHooks<T>;
  /** Max retry attempts before escalation (default: 1). */
  maxRetries?: number;
  /** Description for documentation. */
  description?: string;
}

export interface WrapperTemplate<T = unknown> {
  name: string;
  /** Wrap a function with this template's consensus gate. */
  wrap: (fn: (...args: any[]) => Promise<T> | T) => (...args: any[]) => Promise<DecisionResult<T>>;
  description: string;
}

export function createWrapperTemplate<T = unknown>(
  name: string,
  config: WrapperTemplateConfig<T>,
): WrapperTemplate<T> {
  const {
    reviewers,
    strategy,
    hooks,
    maxRetries = 1,
    description = `Wrapper template: ${name}`,
  } = config;

  function wrap(fn: (...args: any[]) => Promise<T> | T): (...args: any[]) => Promise<DecisionResult<T>> {
    return consensus<T>({
      name,
      fn: fn as (...args: unknown[]) => Promise<T> | T,
      reviewers,
      strategy,
      hooks,
      maxRetries,
    });
  }

  return { name, wrap, description };
}
