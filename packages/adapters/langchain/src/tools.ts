import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";
import {
  BUILT_IN_GUARD_DOMAINS,
  GUARD_DOMAIN_DESCRIPTIONS,
  DEFAULT_GUARD_POLICY,
} from "@consensus-tools/schemas";
import { evaluatorVotes, computeDecision } from "@consensus-tools/guards";
import type { GuardTemplate } from "@consensus-tools/guards";

/**
 * LangChain adapter — consensus-tools guards as LangChain DynamicStructuredTools.
 *
 * Each guard domain becomes a tool that LangChain agents can call.
 * The tool evaluates the input through the guard's evaluator rules
 * and returns the decision as a JSON string.
 */

const DEFAULT_POLICY = {
  ...DEFAULT_GUARD_POLICY,
  policyId: "langchain-guard",
};

function evaluateGuard(domain: string, payload: Record<string, unknown>) {
  const input: GuardEvaluateInput = {
    boardId: "langchain",
    action: { type: domain, payload },
  };

  const votes = evaluatorVotes(input);
  const weighted = votes.map((v) => ({
    ...v,
    weight: 1,
    confidence: 0.8,
    reputation: 100,
  }));
  const result = computeDecision(weighted, DEFAULT_POLICY);

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

export function createGuardTool(domain: string, description?: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: `consensus_guard_${domain}`,
    description: description || GUARD_DOMAIN_DESCRIPTIONS[domain] || `Consensus guard evaluation for ${domain}`,
    schema: z.object({
      payload: z.record(z.unknown()).describe("The action payload to evaluate"),
    }),
    func: async ({ payload }) => {
      const result = evaluateGuard(domain, payload as Record<string, unknown>);
      return JSON.stringify(result, null, 2);
    },
  });
}

export function createGuardTools(
  domains?: string[],
  customTemplates?: GuardTemplate[],
): DynamicStructuredTool[] {
  const domainList = domains ?? BUILT_IN_GUARD_DOMAINS;
  const tools = domainList.map((d) => createGuardTool(d));

  if (customTemplates) {
    for (const tmpl of customTemplates) {
      tools.push(
        new DynamicStructuredTool({
          name: `consensus_guard_${tmpl.name}`,
          description: tmpl.description,
          schema: z.object({
            payload: z.record(z.unknown()).describe("The action payload to evaluate"),
          }),
          func: async ({ payload }) => {
            const input: GuardEvaluateInput = {
              boardId: "langchain",
              action: { type: tmpl.name, payload: payload as Record<string, unknown> },
            };
            const votes = tmpl.evaluate(input);
            const weighted = votes.map((v) => ({
              ...v,
              weight: 1,
              confidence: 0.8,
              reputation: 100,
            }));
            const result = computeDecision(weighted, DEFAULT_POLICY);
            return JSON.stringify({
              decision: result.decision,
              risk: result.combinedRisk,
              votes: votes.map((v) => ({
                evaluator: v.evaluator,
                vote: v.vote,
                reason: v.reason,
                risk: v.risk,
              })),
            }, null, 2);
          },
        }),
      );
    }
  }

  return tools;
}
