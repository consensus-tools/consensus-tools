import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import { createGuardTemplate, GUARD_CONFIGS, DEFAULT_PERSONA_TRIO } from "@consensus-tools/guards";

// ── Types ────────────────────────────────────────────────────────────

export interface GuardCallbackConfig {
  /** Consensus policy: "majority" (default), "supermajority", or "unanimous". */
  policy?: string;
  /** Guard domain names to use as reviewers. Defaults to the standard trio. */
  guards?: string[];
  /** Called after every deliberation decision. */
  onDecision?: (decision: { tool: string; action: string; score: number }) => void;
}

interface ReviewResult {
  score: number;
  rationale?: string;
  block?: boolean;
}

// ── Score aggregation (inline to avoid wrapper tier dependency) ───────

function policyThreshold(policy: string): number {
  switch (policy) {
    case "supermajority": return 0.67;
    case "unanimous": return 0.95;
    case "majority":
    default: return 0.5;
  }
}

function aggregateResults(
  results: ReviewResult[],
  policy: string,
): { action: "allow" | "block"; score: number; reason: string } {
  // Hard block: any reviewer with block:true
  const blocker = results.find((r) => r.block);
  if (blocker) {
    return {
      action: "block",
      score: blocker.score,
      reason: blocker.rationale ?? "Reviewer hard-blocked",
    };
  }

  // Average score check
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const threshold = policyThreshold(policy);

  if (avgScore < threshold) {
    const reasons = results
      .filter((r) => r.score < threshold)
      .map((r) => r.rationale ?? "score below threshold");
    return {
      action: "block",
      score: avgScore,
      reason: reasons.join("; "),
    };
  }

  return { action: "allow", score: avgScore, reason: "Consensus reached" };
}

// ── Callback Handler ─────────────────────────────────────────────────

/**
 * LangChain callback handler that intercepts ALL tool calls and runs them
 * through consensus deliberation before allowing execution.
 *
 * If deliberation blocks the tool call, an error is thrown to prevent execution.
 * If deliberation allows the tool call, execution proceeds normally.
 *
 * Usage:
 * ```ts
 * const handler = new ConsensusGuardCallbackHandler({ policy: "majority" });
 * const result = await agent.invoke({ input: "..." }, { callbacks: [handler] });
 * ```
 */
export class ConsensusGuardCallbackHandler extends BaseCallbackHandler {
  name = "consensus-guard";

  private policy: string;
  private guardDomains: string[];
  private onDecision?: (decision: { tool: string; action: string; score: number }) => void;
  private reviewers: Array<(output: unknown, context: { name: string; args: unknown[]; attempt: number }) => ReviewResult | Promise<ReviewResult>>;

  constructor(config: GuardCallbackConfig = {}) {
    super();
    this.policy = config.policy ?? "majority";
    this.guardDomains = config.guards ?? [...DEFAULT_PERSONA_TRIO];
    this.onDecision = config.onDecision;

    // Build reviewer functions from guard templates
    this.reviewers = this.guardDomains.map((domain) => {
      const guardConfig = GUARD_CONFIGS[domain] ?? {
        description: `Custom guard: ${domain}`,
        rules: () => [{ evaluator: domain, vote: "YES" as const, reason: "No rules configured", risk: 0.1 }],
      };
      return createGuardTemplate(domain, guardConfig).asReviewer();
    });
  }

  async handleToolStart(
    tool: Serialized,
    input: string,
    _runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _runName?: string,
  ): Promise<void> {
    const toolName = tool.name ?? (tool.id?.[tool.id.length - 1]) ?? "";

    // Skip consensus guard tools to avoid recursive governance
    if (toolName.startsWith("consensus_guard_")) {
      return;
    }

    // Parse the input into a payload for reviewers
    let parsedInput: unknown;
    try {
      parsedInput = JSON.parse(input);
    } catch {
      parsedInput = { value: input };
    }

    const payload = typeof parsedInput === "object" && parsedInput !== null
      ? parsedInput
      : { value: parsedInput };

    // Run all reviewers against the tool call
    const context = { name: toolName, args: [toolName, payload], attempt: 1 };
    const results: ReviewResult[] = await Promise.all(
      this.reviewers.map((reviewer) => reviewer(payload, context)),
    );

    // Aggregate results
    const decision = aggregateResults(results, this.policy);

    // Fire onDecision callback
    if (this.onDecision) {
      this.onDecision({ tool: toolName, action: decision.action, score: decision.score });
    }

    // Block if consensus rejects
    if (decision.action === "block") {
      throw new Error(
        `Consensus blocked tool "${toolName}": ${decision.reason} (score: ${decision.score.toFixed(2)})`,
      );
    }

    // Otherwise, tool proceeds normally
  }
}
