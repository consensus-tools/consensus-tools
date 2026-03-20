import type { GuardEvaluateInput, GuardType } from "@consensus-tools/schemas";
import { evaluatorVotes, computeDecision } from "@consensus-tools/guards";
import type { GuardTemplate } from "@consensus-tools/guards";

/**
 * Streaming guard adapter for Vercel AI SDK.
 *
 * Wraps a streamText result with guard evaluation. The stream passes through
 * immediately (no buffering). When the stream completes, the full text is
 * evaluated by the guard. The guard decision is available as a promise.
 *
 * Usage:
 *   const guardedStream = createGuardedStream({ domain: "publish" });
 *   const stream = await streamText({ model, prompt });
 *   const { stream: passthrough, guard } = await guardedStream(stream);
 *
 *   // Use passthrough stream normally (pipe to response, etc.)
 *   // Await guard when ready to check the decision:
 *   const decision = await guard;
 *   if (decision.decision === "block") { // handle }
 */

export interface GuardedStreamOptions {
  /** Built-in guard domain. */
  domain?: GuardType | string;
  /** Custom guard template (overrides domain). */
  template?: GuardTemplate;
  /** Called when stream completes and guard decision is ready. */
  onComplete?: (decision: StreamGuardDecision) => void | Promise<void>;
}

export interface StreamGuardDecision {
  decision: "allow" | "block" | "rewrite" | "escalate";
  text: string;
  guard: {
    votes: Array<{ evaluator: string; vote: string; reason: string; risk: number }>;
    risk: number;
  };
}

export interface GuardedStreamResult<T = any> {
  /** The original stream result — pass through to your response. */
  stream: T;
  /** Promise that resolves with the guard decision when the stream completes. */
  guard: Promise<StreamGuardDecision>;
}

const DEFAULT_POLICY = {
  policyId: "ai-sdk-stream-guard",
  version: "v1",
  quorum: 0.7,
  riskThreshold: 0.7,
  hitlRequiredAboveRisk: 0.7,
  options: {},
};

function runGuard(domain: string, text: string, template?: GuardTemplate) {
  const payload: Record<string, unknown> = { text };
  const input: GuardEvaluateInput = {
    boardId: "ai-sdk-stream",
    action: { type: domain, payload },
  };

  const votes = template ? template.evaluate(input) : evaluatorVotes(input);

  // Hard-block on PII patterns (e.g., SSN)
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) {
    votes.push({ evaluator: "ai-sdk-pii", vote: "NO", reason: "PII pattern detected in streamed output", risk: 0.95 });
  }

  const weighted = votes.map((v) => ({
    ...v,
    weight: 1,
    confidence: 0.8,
    reputation: 100,
  }));
  const result = computeDecision(weighted, DEFAULT_POLICY);

  const decisionMap: Record<string, "allow" | "block" | "rewrite" | "escalate"> = {
    ALLOW: "allow",
    BLOCK: "block",
    REWRITE: "rewrite",
    REQUIRE_HUMAN: "escalate",
  };

  return {
    decision: decisionMap[result.decision] ?? "escalate",
    risk: result.combinedRisk,
    votes: votes.map((v) => ({
      evaluator: v.evaluator,
      vote: v.vote,
      reason: v.reason,
      risk: v.risk,
    })),
  };
}

export function createGuardedStream<T extends { text: Promise<string> }>(
  opts: GuardedStreamOptions,
): (streamResult: T) => Promise<GuardedStreamResult<T>> {
  const domain = opts.template?.name ?? opts.domain ?? "publish";

  return async (streamResult) => {
    // Create a promise that resolves when the stream text is complete
    const guardPromise = streamResult.text.then(async (fullText) => {
      const guardResult = runGuard(domain, fullText, opts.template);

      const decision: StreamGuardDecision = {
        decision: guardResult.decision,
        text: fullText,
        guard: {
          votes: guardResult.votes,
          risk: guardResult.risk,
        },
      };

      await opts.onComplete?.(decision);
      return decision;
    });

    return {
      stream: streamResult,
      guard: guardPromise,
    };
  };
}
