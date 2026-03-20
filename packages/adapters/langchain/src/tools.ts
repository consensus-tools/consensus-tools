import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import type { GuardEvaluateInput, GuardType } from "@consensus-tools/schemas";
import { evaluatorVotes, computeDecision } from "@consensus-tools/guards";
import type { GuardTemplate } from "@consensus-tools/guards";

/**
 * LangChain adapter — consensus-tools guards as LangChain DynamicStructuredTools.
 *
 * Each guard domain becomes a tool that LangChain agents can call.
 * The tool evaluates the input through the guard's evaluator rules
 * and returns the decision as a JSON string.
 */

const BUILT_IN_DOMAINS: GuardType[] = [
  "send_email",
  "code_merge",
  "publish",
  "support_reply",
  "agent_action",
  "deployment",
  "permission_escalation",
];

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  send_email: "Evaluate email safety — checks for secrets, PII, and restricted content in outbound emails",
  code_merge: "Evaluate code merge safety — flags sensitive files (auth/security/crypto), failing tests, and vulnerability patterns",
  publish: "Evaluate content safety — detects profanity, PII patterns, guarantee language, and legal/medical claims",
  support_reply: "Evaluate customer support reply — flags escalation language, threats, and safety violations",
  agent_action: "Evaluate autonomous agent action — blocks irreversible actions, flags external side effects",
  deployment: "Evaluate deployment safety — blocks failed CI, flags missing rollback plans, requires review for production",
  permission_escalation: "Evaluate permission change — blocks wildcard permissions, flags break-glass and admin escalations",
};

const DEFAULT_POLICY = {
  policyId: "langchain-guard",
  version: "v1",
  quorum: 0.7,
  riskThreshold: 0.7,
  hitlRequiredAboveRisk: 0.7,
  options: {},
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
    description: description || DOMAIN_DESCRIPTIONS[domain] || `Consensus guard evaluation for ${domain}`,
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
  const domainList = domains ?? BUILT_IN_DOMAINS;
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
