import { randomUUID } from "node:crypto";
import type { GuardEvaluateInput, GuardResult, GuardPolicy } from "@consensus-tools/schemas";
import { BUILT_IN_GUARD_DOMAINS } from "@consensus-tools/schemas";
import { evaluatorVotes, finalizeVotes, normalizeGuardType, type GuardEvaluatorRegistry } from "@consensus-tools/guards";
import type { IStorage } from "@consensus-tools/storage";
import type { AgentRegistry } from "./agent-registry.js";
import { newId } from "../util/helpers.js";
import { nowIso } from "../util/time.js";

export interface GuardEngineOptions {
  storage: IStorage;
  agentRegistry?: AgentRegistry;
  evaluatorRegistry?: GuardEvaluatorRegistry;
  defaultPolicy?: GuardPolicy;
}

/**
 * Orchestrates guard evaluation: scope check → evaluate → persist audit → return result.
 */
export class GuardEngine {
  private readonly storage: IStorage;
  private readonly agentRegistry?: AgentRegistry;
  private readonly evaluatorRegistry?: GuardEvaluatorRegistry;
  private readonly defaultPolicy?: GuardPolicy;

  constructor(opts: GuardEngineOptions) {
    this.storage = opts.storage;
    this.agentRegistry = opts.agentRegistry;
    this.evaluatorRegistry = opts.evaluatorRegistry;
    this.defaultPolicy = opts.defaultPolicy;
  }

  // Guard types this engine can actually evaluate. Callers that accept a dynamic
  // action.type (e.g. the MCP guard.evaluate tool) should gate on this rather than
  // the full guardTypeSchema enum: a schema type with no registered evaluator falls
  // through to the permissive generic evaluator (unconditional YES), so advertising
  // it is a silent-ALLOW path.
  supportedGuardTypes(): string[] {
    return this.evaluatorRegistry ? this.evaluatorRegistry.listTypes() : [...BUILT_IN_GUARD_DOMAINS];
  }

  async evaluate(input: GuardEvaluateInput, policy?: GuardPolicy): Promise<GuardResult> {
    const effectivePolicy = policy ?? this.defaultPolicy;
    const auditId = randomUUID();
    const now = nowIso();
    const guardType = normalizeGuardType(input.action.type);

    // Scope check
    if (input.agentId && this.agentRegistry) {
      const scopeCheck = await this.agentRegistry.validateAgentScope(input.agentId, input.action.type);
      if (!scopeCheck.allowed) {
        const result: GuardResult = {
          decision: "BLOCK",
          reason: scopeCheck.reason,
          risk_score: 1.0,
          audit_id: auditId,
          votes: [],
          guard_type: guardType,
        };
        await this.persistAuditEvents(input, result, [], now);
        return result;
      }
    }

    // Run evaluators
    const votes = this.evaluatorRegistry
      ? this.evaluatorRegistry.evaluate(input)
      : evaluatorVotes(input);

    // Compute decision
    const partial = finalizeVotes(votes, input.action.type, effectivePolicy);
    const result: GuardResult = {
      ...partial,
      audit_id: auditId,
      votes,
      guard_type: guardType,
    };

    await this.persistAuditEvents(input, result, votes, now);

    return result;
  }

  private async persistAuditEvents(
    input: GuardEvaluateInput,
    result: GuardResult,
    votes: Array<{ evaluator: string; vote: string; reason: string; risk: number }>,
    now: string,
  ): Promise<void> {
    await this.storage.update((state) => {
      state.audit.push({
        id: newId("audit"),
        at: now,
        type: "PROPOSED_ACTION",
        details: {
          boardId: input.boardId,
          agentId: input.agentId,
          actionType: input.action.type,
          auditId: result.audit_id,
        },
      });

      for (const v of votes) {
        state.audit.push({
          id: newId("audit"),
          at: now,
          type: "EVALUATOR_VOTE",
          details: {
            auditId: result.audit_id,
            evaluator: v.evaluator,
            vote: v.vote,
            reason: v.reason,
            risk: v.risk,
          },
        });
      }

      state.audit.push({
        id: newId("audit"),
        at: now,
        type: "FINAL_DECISION",
        details: {
          auditId: result.audit_id,
          decision: result.decision,
          reason: result.reason,
          riskScore: result.risk_score,
          guardType: result.guard_type,
        },
      });

      state.guardResults.push(result);
    });
  }
}
