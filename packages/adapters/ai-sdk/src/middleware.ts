import type { GuardEvaluateInput, GuardType } from "@consensus-tools/schemas";
import { evaluatorVotes, computeDecision } from "@consensus-tools/guards";
import type { GuardTemplate } from "@consensus-tools/guards";

/**
 * Vercel AI SDK adapter — guard middleware for generateText/streamText.
 *
 * Wraps any AI SDK generate call with a consensus guard that evaluates
 * the LLM output before returning it. If the output fails the guard,
 * it's blocked and the onBlock callback is called.
 *
 * Usage:
 *   const guardedGenerate = createGuardedGenerate({ domain: "publish" });
 *   const result = await guardedGenerate(() => generateText({ model, prompt }));
 */

export interface GuardedGenerateOptions {
  /** Built-in guard domain to use (e.g., "publish", "support_reply"). */
  domain?: GuardType | string;
  /** Custom guard template (overrides domain). */
  template?: GuardTemplate;
  /** Guard policy overrides. */
  policy?: {
    quorum?: number;
    riskThreshold?: number;
  };
  /** Called when output is allowed. */
  onAllow?: (output: any, decision: any) => void | Promise<void>;
  /** Called when output is blocked. */
  onBlock?: (output: any, decision: any) => void | Promise<void>;
  /** Called when output needs rewrite. */
  onRewrite?: (output: any, decision: any) => void | Promise<void>;
}

export interface GuardedResult<T = any> {
  decision: "allow" | "block" | "rewrite" | "escalate";
  output: T;
  guard: {
    votes: Array<{
      evaluator: string;
      vote: string;
      reason: string;
      risk: number;
    }>;
    risk: number;
  };
}

const DEFAULT_POLICY = {
  policyId: "ai-sdk-guard",
  version: "v1",
  quorum: 0.7,
  riskThreshold: 0.7,
  hitlRequiredAboveRisk: 0.7,
  options: {},
};

/** Detect PII patterns that should hard-block AI output. */
function detectPII(payload: Record<string, unknown>): boolean {
  const text = Object.values(payload).filter((v) => typeof v === "string").join(" ");
  return /\b\d{3}-\d{2}-\d{4}\b/.test(text); // SSN pattern
}

function runGuard(
  domain: string,
  payload: Record<string, unknown>,
  template?: GuardTemplate,
  policyOverrides?: { quorum?: number; riskThreshold?: number },
) {
  const input: GuardEvaluateInput = {
    boardId: "ai-sdk",
    action: { type: domain, payload },
  };

  const votes = template ? template.evaluate(input) : evaluatorVotes(input);

  // AI SDK adapter adds a hard-block vote for PII patterns detected in output
  if (detectPII(payload)) {
    votes.push({ evaluator: "ai-sdk-pii", vote: "NO", reason: "PII pattern detected in LLM output", risk: 0.95 });
  }

  const weighted = votes.map((v) => ({
    ...v,
    weight: 1,
    confidence: 0.8,
    reputation: 100,
  }));

  const policy = { ...DEFAULT_POLICY, ...policyOverrides };
  const result = computeDecision(weighted, policy);

  return {
    decision: result.decision,
    risk: result.combinedRisk,
    votes: votes.map((v) => ({
      evaluator: v.evaluator,
      vote: v.vote,
      reason: v.reason,
      risk: v.risk,
    })),
  };
}

export function createGuardedGenerate<T extends { text?: string; [key: string]: any }>(
  opts: GuardedGenerateOptions,
): (generateFn: () => Promise<T>) => Promise<GuardedResult<T>> {
  const domain = opts.template?.name ?? opts.domain ?? "publish";

  return async (generateFn) => {
    const output = await generateFn();

    // Extract text from the AI SDK result for guard evaluation
    const payload: Record<string, unknown> = {};
    if (output.text) payload.text = output.text;
    if (output.body) payload.body = output.body;

    // Copy any string fields for guard scanning
    for (const [key, val] of Object.entries(output)) {
      if (typeof val === "string") payload[key] = val;
    }

    const guardResult = runGuard(domain, payload, opts.template, opts.policy);

    const decisionMap: Record<string, "allow" | "block" | "rewrite" | "escalate"> = {
      ALLOW: "allow",
      BLOCK: "block",
      REWRITE: "rewrite",
      REQUIRE_HUMAN: "escalate",
    };
    const decision = decisionMap[guardResult.decision] ?? "escalate";

    const result: GuardedResult<T> = {
      decision,
      output,
      guard: {
        votes: guardResult.votes,
        risk: guardResult.risk,
      },
    };

    // Call hooks
    if (decision === "allow") await opts.onAllow?.(output, guardResult);
    if (decision === "block") await opts.onBlock?.(output, guardResult);
    if (decision === "rewrite") await opts.onRewrite?.(output, guardResult);

    return result;
  };
}
