import type { GuardType, GuardVote, GuardEvaluateInput } from "@consensus-tools/schemas";
import { evaluatorVotes } from "./evaluators.js";

export type EvaluatorFn = (input: GuardEvaluateInput) => GuardVote[];

/**
 * Registry of guard evaluator functions keyed by GuardType.
 * The 7 built-in evaluators are registered by default.
 * Custom evaluators can be registered to override or extend behavior.
 */
export class GuardEvaluatorRegistry {
  private evaluators = new Map<string, EvaluatorFn>();

  constructor() {
    // Register the built-in evaluator that handles all 7 guard types.
    // It dispatches internally based on action.type.
    this.registerDefault();
  }

  private registerDefault() {
    const types: GuardType[] = [
      "send_email",
      "code_merge",
      "publish",
      "support_reply",
      "agent_action",
      "deployment",
      "permission_escalation",
    ];
    for (const t of types) {
      this.evaluators.set(t, evaluatorVotes);
    }
  }

  register(guardType: string, fn: EvaluatorFn): void {
    this.evaluators.set(guardType, fn);
  }

  get(guardType: string): EvaluatorFn | undefined {
    return this.evaluators.get(guardType);
  }

  evaluate(input: GuardEvaluateInput): GuardVote[] {
    const fn = this.evaluators.get(input.action.type);
    if (fn) return fn(input);
    // Fallback: use the default evaluator which handles unknown types
    return evaluatorVotes(input);
  }

  listTypes(): string[] {
    return Array.from(this.evaluators.keys());
  }
}

export function createGuardEvaluatorRegistry(): GuardEvaluatorRegistry {
  return new GuardEvaluatorRegistry();
}
