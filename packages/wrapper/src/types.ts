import type { PolicyResolver } from "@consensus-tools/schemas";

/** A function that reviews an output and returns a score + optional rationale. */
export type ReviewerFn<T = unknown> = (output: T, context: ReviewContext) => Promise<ReviewResult> | ReviewResult;

export interface ReviewContext {
  /** The name of the consensus-wrapped function. */
  name: string;
  /** The input arguments that produced this output. */
  args: unknown[];
  /** Attempt number (1-based). */
  attempt: number;
}

export interface ReviewResult {
  /** Score between 0 and 1. */
  score: number;
  /** Optional explanation of the score. */
  rationale?: string;
  /** Whether this reviewer explicitly blocks the output. */
  block?: boolean;
}

/** How multiple reviewer scores combine into a final decision. */
export type Strategy = "unanimous" | "majority" | "threshold";

export interface StrategyConfig {
  strategy: Strategy;
  /** Required score threshold (default: 0.5 for threshold strategy). */
  threshold?: number;
}

/** The final decision after reviewers evaluate an output. */
export interface DecisionResult<T = unknown> {
  action: "allow" | "block" | "retry" | "escalate";
  output: T | null;
  scores: ReviewResult[];
  aggregateScore: number;
  attempt: number;
}

/** Lifecycle hooks for the consensus wrapper. */
export interface LifecycleHooks<T = unknown> {
  beforeSubmit?: (args: unknown[]) => void | Promise<void>;
  afterResolve?: (result: DecisionResult<T>) => void | Promise<void>;
  onBlock?: (result: DecisionResult<T>) => void | Promise<void>;
  onEscalate?: (result: DecisionResult<T>) => void | Promise<void>;
}

/** Options for consensus(). */
export interface ConsensusOptions<T = unknown> {
  name: string;
  fn: (...args: unknown[]) => Promise<T> | T;
  reviewers: ReviewerFn<T>[];
  strategy?: StrategyConfig;
  hooks?: LifecycleHooks<T>;
  maxRetries?: number;
  /** Optional policy resolver to use for the underlying engine. */
  policyResolver?: PolicyResolver;
}
