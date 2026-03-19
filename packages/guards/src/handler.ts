import crypto from "node:crypto";
import type {
  GuardEvaluateInput,
  GuardResult,
  GuardPolicy,
  GuardVote,
  WeightedGuardVote,
} from "@consensus-tools/schemas";
import type { IStorage } from "@consensus-tools/storage";
import { createEvent, EventBuffer, ConsoleSink } from "@consensus-tools/telemetry";
import { GuardEvaluatorRegistry } from "./registry.js";
import { computeDecision, normalizeGuardType } from "./decision.js";
import { detectHardBlockFlags } from "./taxonomy.js";
import type { HardBlockFlag } from "./taxonomy.js";

/**
 * Unified guard handler — replaces 7 standalone consensus-*-guard packages.
 *
 * Flow:
 *   validate input → check idempotency → evaluate (registry) →
 *   detect hard-blocks → compute decision → write to storage → return result
 *
 * NOTE: Idempotency uses in-memory cache keyed by SHA-256 of input.
 * Known limitation: concurrent duplicate calls can race past the check.
 * See TODOS.md T12 for the fix (requires atomic storage upsert).
 */
export interface GuardHandlerOptions {
  storage: IStorage;
  policy?: Partial<GuardPolicy>;
  enableLogging?: boolean;
}

const DEFAULT_POLICY: GuardPolicy = {
  policyId: "default",
  version: "v1",
  quorum: 0.7,
  riskThreshold: 0.7,
  hitlRequiredAboveRisk: 0.7,
  options: {},
};

export class GuardHandler {
  readonly registry: GuardEvaluatorRegistry;
  private readonly storage: IStorage;
  private readonly policy: GuardPolicy;
  private readonly idempotencyCache = new Map<string, GuardResult>();
  private readonly events: EventBuffer | null;

  constructor(opts: GuardHandlerOptions) {
    this.storage = opts.storage;
    this.policy = { ...DEFAULT_POLICY, ...opts.policy };
    this.registry = new GuardEvaluatorRegistry();

    if (opts.enableLogging !== false) {
      this.events = new EventBuffer([new ConsoleSink()]);
    } else {
      this.events = null;
    }
  }

  async evaluate(input: GuardEvaluateInput): Promise<GuardResult> {
    const idempotencyKey = this.makeIdempotencyKey(input);

    // Check in-memory cache
    const cached = this.idempotencyCache.get(idempotencyKey);
    if (cached) return cached;

    // Check storage for prior result
    const state = await this.storage.getState();
    const prior = state.guardResults.find((r) => r.audit_id === idempotencyKey);
    if (prior) {
      this.idempotencyCache.set(idempotencyKey, prior);
      return prior;
    }

    // Evaluate via registry
    const votes = this.registry.evaluate(input);

    // Check hard-block flags in payload text
    const textToScan = this.extractText(input);
    const hardBlockFlags = detectHardBlockFlags(textToScan);

    // Compute decision
    let result: GuardResult;
    if (hardBlockFlags.length > 0) {
      result = this.buildHardBlockResult(idempotencyKey, hardBlockFlags, votes, input);
    } else {
      result = this.buildDecisionResult(idempotencyKey, votes, input);
    }

    // Write to storage
    await this.storage.update((s) => {
      s.guardResults.push(result);
    });

    // Cache and log
    this.idempotencyCache.set(idempotencyKey, result);
    this.log(input, result);

    return result;
  }

  private makeIdempotencyKey(input: GuardEvaluateInput): string {
    const payload = { boardId: input.boardId, action: input.action };
    return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }

  private extractText(input: GuardEvaluateInput): string {
    const p = input.action.payload || {};
    const parts: string[] = [];
    for (const key of ["text", "body", "message", "summary", "diff_summary", "subject"]) {
      if (typeof p[key] === "string") parts.push(p[key] as string);
    }
    return parts.join("\n");
  }

  private buildHardBlockResult(
    auditId: string,
    flags: HardBlockFlag[],
    votes: GuardVote[],
    input: GuardEvaluateInput,
  ): GuardResult {
    return {
      decision: "BLOCK",
      reason: `Hard-block flags detected: ${flags.join(", ")}`,
      risk_score: 1.0,
      audit_id: auditId,
      votes,
      guard_type: normalizeGuardType(input.action.type),
    };
  }

  private buildDecisionResult(
    auditId: string,
    votes: GuardVote[],
    input: GuardEvaluateInput,
  ): GuardResult {
    const weightedVotes: WeightedGuardVote[] = votes.map((v) => ({
      ...v,
      weight: 1,
      confidence: 0.8,
      reputation: 100,
    }));

    const { decision, combinedRisk, weightedYesRatio } = computeDecision(
      weightedVotes,
      this.policy,
    );

    return {
      decision,
      reason: votes[0]?.reason ?? "No evaluator votes",
      risk_score: combinedRisk,
      audit_id: auditId,
      weighted_yes: weightedYesRatio,
      votes,
      guard_type: normalizeGuardType(input.action.type),
    };
  }

  private log(input: GuardEvaluateInput, result: GuardResult): void {
    if (!this.events) return;
    this.events.push(
      createEvent("guard.evaluated", undefined, {
        boardId: input.boardId,
        guardType: input.action.type,
        decision: result.decision,
        riskScore: result.risk_score,
        voteCount: result.votes?.length ?? 0,
        auditId: result.audit_id,
      }),
    );
  }
}
