import type { GuardVote, GuardEvaluateInput } from "@consensus-tools/schemas";
import type { GuardEvaluatorRegistry } from "./registry.js";

// Inline wrapper-compatible types to avoid circular dependency (guards=Tier1, wrapper=Tier3).
// These match @consensus-tools/wrapper's ReviewerFn/ReviewResult/ReviewContext exactly.
interface ReviewContext {
  name: string;
  args: unknown[];
  attempt: number;
}

interface ReviewResult {
  score: number;
  rationale?: string;
  block?: boolean;
}

type ReviewerFn<T = unknown> = (output: T, context: ReviewContext) => Promise<ReviewResult> | ReviewResult;

/**
 * Guard template — reusable configuration for a custom guard domain.
 *
 * Creates a guard evaluator from user-defined rules that can be consumed:
 * - Via guards: template.register(registry) → GuardHandler evaluates it
 * - Via wrapper: template.asReviewer() → consensus() uses it as a reviewer
 * - Via MCP: registered guards are exposed as MCP tools automatically
 */

export interface GuardTemplateConfig {
  /** Evaluator rules: given a payload, return guard votes. */
  rules: (payload: Record<string, unknown>) => GuardVote[];
  /** Regex patterns that trigger automatic NO vote (hard-block). */
  hardBlockPatterns?: RegExp[];
  /** Description for documentation and MCP tool registration. */
  description?: string;
}

export interface GuardTemplate {
  /** The guard domain name (e.g., "loan_approval"). */
  name: string;
  /** Evaluate input through this template's rules. */
  evaluate: (input: GuardEvaluateInput) => GuardVote[];
  /** Convert to a wrapper-compatible reviewer function. */
  asReviewer: () => ReviewerFn;
  /** Register into a GuardEvaluatorRegistry. */
  register: (registry: GuardEvaluatorRegistry) => void;
  /** Description for docs/MCP. */
  description: string;
}

export function createGuardTemplate(name: string, config: GuardTemplateConfig): GuardTemplate {
  const { rules, hardBlockPatterns = [], description = `Custom guard: ${name}` } = config;

  function evaluate(input: GuardEvaluateInput): GuardVote[] {
    const payload = (input.action.payload || {}) as Record<string, unknown>;

    // Check hard-block patterns against all string values in payload
    if (hardBlockPatterns.length > 0) {
      const textParts: string[] = [];
      for (const val of Object.values(payload)) {
        if (typeof val === "string") textParts.push(val);
      }
      const fullText = textParts.join(" ");

      for (const pattern of hardBlockPatterns) {
        if (pattern.test(fullText)) {
          return [{
            evaluator: `${name}-hardblock`,
            vote: "NO",
            reason: `Hard-block pattern matched: ${pattern.source}`,
            risk: 1.0,
          }];
        }
      }
    }

    // Run user-defined rules
    return rules(payload);
  }

  function asReviewer(): ReviewerFn {
    return (output: unknown, context: ReviewContext): ReviewResult => {
      // Convert the output to a payload for the guard evaluator
      const payload = typeof output === "object" && output !== null
        ? output as Record<string, unknown>
        : { value: output };

      const input: GuardEvaluateInput = {
        boardId: context.name,
        action: { type: name, payload },
      };

      const votes = evaluate(input);
      if (votes.length === 0) {
        return { score: 1.0, rationale: "No evaluator votes", block: false };
      }

      // Convert guard votes to a review score
      const vote = votes[0]!;
      const score = vote.vote === "YES" ? 1.0 - (vote.risk ?? 0.2)
        : vote.vote === "REWRITE" ? 0.5 - (vote.risk ?? 0.5) * 0.3
        : 0.0;

      return {
        score: Math.max(0, Math.min(1, score)),
        rationale: vote.reason,
        block: vote.vote === "NO",
      };
    };
  }

  function register(registry: GuardEvaluatorRegistry): void {
    registry.register(name, evaluate);
  }

  return { name, evaluate, asReviewer, register, description };
}
