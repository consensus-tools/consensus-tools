import { guardVoteSchema } from "@consensus-tools/schemas";
import type { AgentPersona } from "./personas.js";

export type AgentWithRep = AgentPersona & { reputation: number };

export interface ParsedVote {
  agentId: string;
  agentName: string;
  vote: "YES" | "NO" | "REWRITE";
  risk: number;
  reason: string;
  reputation: number;
}

/**
 * Parse a VOTE: X | RISK: Y | REASON: Z response from an LLM.
 * Uses guardVoteSchema.safeParse() for validation.
 * On parse failure → defaults to REWRITE (conservative, not YES).
 */
export function parseVote(text: string, agent: AgentWithRep): ParsedVote {
  const voteMatch = /VOTE:\s*(YES|NO|REWRITE)/i.exec(text);
  const riskMatch = /RISK:\s*([\d.]+)/i.exec(text);
  const reasonMatch = /REASON:\s*(.+)/i.exec(text);

  const rawVote = voteMatch?.[1]?.toUpperCase() || "REWRITE";
  const rawRisk = parseFloat(riskMatch?.[1] || "0.5");
  const rawReason = reasonMatch?.[1]?.trim() || "No issues detected";

  const result = guardVoteSchema.safeParse({
    evaluator: agent.id,
    vote: rawVote,
    risk: Math.min(1, Math.max(0, rawRisk)),
    reason: rawReason,
  });

  if (result.success) {
    return {
      agentId: agent.id,
      agentName: agent.name,
      vote: result.data.vote,
      risk: result.data.risk,
      reason: result.data.reason,
      reputation: agent.reputation,
    };
  }

  return {
    agentId: agent.id,
    agentName: agent.name,
    vote: "REWRITE",
    risk: 0.5,
    reason: "Vote parse failure — defaulting to REWRITE",
    reputation: agent.reputation,
  };
}
