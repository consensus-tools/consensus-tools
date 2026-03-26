import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import { createGuardTemplate } from "@consensus-tools/guards";
import type { GuardTemplateConfig } from "@consensus-tools/guards";

// ── Helper: recursively extract all strings from a value ─────────────

function extractStrings(obj: unknown): string {
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map(extractStrings).join(" ");
  if (obj && typeof obj === "object") return Object.values(obj).map(extractStrings).join(" ");
  return String(obj);
}

// ── Guard rule factories keyed by persona domain ─────────────────────

const GUARD_CONFIGS: Record<string, GuardTemplateConfig> = {
  security: {
    description: "Security reviewer — flags dangerous operations, secret exposure, and injection risks",
    rules: (payload) => {
      const text = extractStrings(payload);
      if (/\b(delete|drop|truncate|rm\s+-rf)\b/i.test(text)) {
        return [{ evaluator: "security", vote: "NO", reason: "Destructive operation detected", risk: 0.9 }];
      }
      if (/\b(password|secret|token|api[_-]?key)\b/i.test(text)) {
        return [{ evaluator: "security", vote: "REWRITE", reason: "Potential secret exposure", risk: 0.7 }];
      }
      return [{ evaluator: "security", vote: "YES", reason: "No security concerns", risk: 0.1 }];
    },
    hardBlockPatterns: [
      /\bexec\s*\(\s*['"].*rm\s+-rf/i,
      /\bchild_process\b/i,
      /\b(execSync|spawnSync|spawn|fork)\s*\(/i,
      /\beval\s*\(/,
      /\bFunction\s*\(/,
      /import\s*\(\s*['"]child_process['"]\s*\)/,
    ],
  },
  compliance: {
    description: "Compliance reviewer — flags PII, regulated data, and policy violations",
    rules: (payload) => {
      const text = extractStrings(payload);
      if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) {
        return [{ evaluator: "compliance", vote: "NO", reason: "SSN pattern detected", risk: 0.95 }];
      }
      if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) {
        return [{ evaluator: "compliance", vote: "REWRITE", reason: "Email PII detected", risk: 0.5 }];
      }
      return [{ evaluator: "compliance", vote: "YES", reason: "No compliance concerns", risk: 0.1 }];
    },
  },
  "user-impact": {
    description: "User-impact reviewer — flags irreversible actions and high blast-radius operations",
    rules: (payload) => {
      const text = extractStrings(payload);
      if (/\b(broadcast|mass[_-]?(email|notify|delete))\b/i.test(text)) {
        return [{ evaluator: "user-impact", vote: "NO", reason: "Mass operation affects many users", risk: 0.85 }];
      }
      if (/\b(irreversible|permanent|cannot\s+undo)\b/i.test(text)) {
        return [{ evaluator: "user-impact", vote: "REWRITE", reason: "Irreversible action flagged", risk: 0.6 }];
      }
      return [{ evaluator: "user-impact", vote: "YES", reason: "Low user impact", risk: 0.1 }];
    },
  },
};

const DEFAULT_PERSONA_TRIO = ["security", "compliance", "user-impact"] as const;

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
