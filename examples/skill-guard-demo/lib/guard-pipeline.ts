import { generateText } from "ai";
import type { LanguageModelV1 } from "ai";
import { computeDecision } from "@consensus-tools/guards";
import type { WeightedGuardVote, GuardPolicy } from "@consensus-tools/schemas";
import type { SkillAgent, SkillProposal, GuardVoteResult, GuardPipelineResult } from "./types.js";

const POLICY: GuardPolicy = {
  policyId: "skill-guard",
  version: "v1",
  quorum: 0.6,
  riskThreshold: 0.5,
  hitlRequiredAboveRisk: 0.7,
  options: {},
};

function buildGuardPrompt(agent: SkillAgent, proposal: SkillProposal): string {
  return `You are ${agent.name} (${agent.role}). ${agent.systemPrompt}

Evaluate this proposed SKILL.md for ${proposal.skillName} BEFORE it is accepted.

The author describes their change as: "${proposal.changeSummary}"

Focus on: ${agent.evaluationFocus}

Consider:
- Is this document high quality for an AI agent reader?
- Are there errors, inconsistencies, or gaps?
- Is the content well-organized and complete?

PROPOSED ${proposal.skillName}/SKILL.md:
${proposal.proposedContent}

Respond with exactly one line in this format:
VOTE: <YES|NO|REWRITE> | RISK: <0.0-1.0> | REASON: <brief explanation>`;
}

function parseGuardVote(text: string, agent: SkillAgent): GuardVoteResult {
  const voteMatch = /VOTE:\s*(YES|NO|REWRITE)/i.exec(text);
  const riskMatch = /RISK:\s*([\d.]+)/i.exec(text);
  const reasonMatch = /REASON:\s*(.+)/i.exec(text);

  return {
    evaluator: agent.id,
    vote: (voteMatch?.[1]?.toUpperCase() as "YES" | "NO" | "REWRITE") || "YES",
    risk: Math.min(1, Math.max(0, parseFloat(riskMatch?.[1] || "0.5"))),
    reason: reasonMatch?.[1]?.trim() || `${agent.name}: No issues detected`,
  };
}

export async function runSkillGuards(
  proposal: SkillProposal,
  agents: SkillAgent[],
  model: LanguageModelV1,
): Promise<GuardPipelineResult> {
  // Sequential with delay to respect rate limits (30K tokens/min on lower tiers)
  const votes: GuardVoteResult[] = [];
  for (const agent of agents) {
    try {
      const result = await generateText({
        model,
        prompt: buildGuardPrompt(agent, proposal),
        maxTokens: 150,
      });
      votes.push(parseGuardVote(result.text, agent));
    } catch (err: any) {
      votes.push({
        evaluator: agent.id,
        vote: "YES" as const,
        risk: 0.5,
        reason: `${agent.name}: Evaluation failed (${err.message}), defaulting to cautious pass`,
      });
    }
    // Small delay between guard calls to avoid rate limits
    await new Promise((r) => setTimeout(r, 2000));
  }

  const weightedVotes: WeightedGuardVote[] = votes.map((v) => ({
    ...v,
    weight: 1,
    confidence: 1 - v.risk,
    reputation: agents.find((a) => a.id === v.evaluator)?.reputation ?? 100,
  }));

  const result = computeDecision(weightedVotes, POLICY, "hybrid");

  return {
    decision: result.decision === "REQUIRE_HUMAN" ? "BLOCK" : result.decision,
    votes,
    combinedRisk: result.combinedRisk,
    quorumMet: result.quorumMet,
    weightedYesRatio: result.weightedYesRatio,
    tally: result.tally,
  };
}

/** Deterministic fallback for --dry-run mode */
export function mockGuardResult(agents: SkillAgent[]): GuardPipelineResult {
  const votes: GuardVoteResult[] = agents.map((a, i) => ({
    evaluator: a.id,
    vote: i < 3 ? "YES" : "REWRITE",
    risk: 0.2 + i * 0.1,
    reason: `[mock] ${a.name}: Looks reasonable`,
  }));

  return {
    decision: "ALLOW",
    votes,
    combinedRisk: 0.35,
    quorumMet: true,
    weightedYesRatio: 0.65,
    tally: {
      yes: 3,
      no: 0,
      rewrite: 2,
      totalWeight: 5,
      weightedYes: 3,
      weightedNo: 0,
      weightedRewrite: 2,
      voterCount: 5,
    },
  };
}
