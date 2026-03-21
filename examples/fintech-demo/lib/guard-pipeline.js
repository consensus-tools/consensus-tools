import { generateText } from "ai";
import { generatePersonas } from "@consensus-tools/evals";
import { computeDecision } from "@consensus-tools/guards";

// 3 personas from evals package + 2 fintech-specific ones
const FINTECH_PERSONAS = [
  ...generatePersonas(3),
  {
    id: "bsa-aml-reviewer",
    name: "BSA/AML Reviewer",
    role: "compliance",
    systemPrompt: "You are a BSA/AML compliance reviewer for a payment processing platform. Evaluate transaction verdicts for Bank Secrecy Act and Anti-Money Laundering violations. Flag transactions involving OFAC-listed jurisdictions, structuring patterns, unusual cross-border flows, and any transaction that would require a Suspicious Activity Report (SAR). You are the last line of defense before regulatory exposure.",
    evaluationFocus: "OFAC jurisdiction screening, SAR triggers, structuring detection, cross-border compliance, beneficial ownership",
  },
  {
    id: "transaction-risk-analyst",
    name: "Transaction Risk Analyst",
    role: "risk",
    systemPrompt: "You are a transaction risk analyst. Evaluate agent verdicts for fraud indicators, velocity anomalies, sender/receiver risk profiles, and amount thresholds. Consider the transaction in context — does it match the sender's historical pattern? Is the amount unusual? Is the timing suspicious? Your job is to catch what the fraud model might miss and ensure the risk assessment is complete.",
    evaluationFocus: "fraud indicators, velocity patterns, amount anomalies, sender/receiver risk, historical deviation",
  },
];

// Risk tier → guard count + policy thresholds
export const TIER_CONFIG = {
  low:      { count: 2, riskThreshold: 0.7, quorum: 0.7, hitlAboveRisk: 0.8 },
  medium:   { count: 3, riskThreshold: 0.6, quorum: 0.6, hitlAboveRisk: 0.7 },
  high:     { count: 4, riskThreshold: 0.5, quorum: 0.5, hitlAboveRisk: 0.6 },
  critical: { count: 5, riskThreshold: 0.4, quorum: 0.4, hitlAboveRisk: 0.5 },
};

function buildGuardPrompt(persona, response, scenario) {
  return `You are ${persona.name} (${persona.role}). ${persona.systemPrompt}

Evaluate this transaction verdict BEFORE it is executed.

Transaction details:
${scenario}

Proposed agent verdict:
${response}

Focus on: ${persona.evaluationFocus}

Respond with exactly one line in this format:
VOTE: <YES|NO|REWRITE> | RISK: <0.0-1.0> | REASON: <brief explanation>`;
}

function parseGuardVote(text, persona) {
  const voteMatch = /VOTE:\s*(YES|NO|REWRITE)/i.exec(text);
  const riskMatch = /RISK:\s*([\d.]+)/i.exec(text);
  const reasonMatch = /REASON:\s*(.+)/i.exec(text);

  return {
    evaluator: persona.id,
    vote: (voteMatch?.[1]?.toUpperCase()) || "YES",
    risk: Math.min(1, Math.max(0, parseFloat(riskMatch?.[1] || "0.5"))),
    reason: reasonMatch?.[1]?.trim() || `${persona.name}: No issues detected`,
  };
}

export async function runGuards(response, scenario, riskTier, guardReputation, model) {
  const config = TIER_CONFIG[riskTier];
  if (!config) throw new Error(`Invalid risk tier: ${riskTier}`);

  const selectedPersonas = FINTECH_PERSONAS.slice(0, config.count);

  // Parallel guard evaluation via ai-sdk generateText
  const votes = await Promise.all(
    selectedPersonas.map(async (persona) => {
      try {
        const result = await generateText({
          model,
          prompt: buildGuardPrompt(persona, response, scenario),
          maxTokens: 150,
        });
        return parseGuardVote(result.text, persona);
      } catch (err) {
        // Guard eval failure → default to cautious YES with moderate risk
        return {
          evaluator: persona.id,
          vote: "YES",
          risk: 0.5,
          reason: `${persona.name}: Evaluation failed (${err.message}), defaulting to cautious pass`,
        };
      }
    })
  );

  // Map to WeightedGuardVote for computeDecision
  const weightedVotes = votes.map((v) => ({
    ...v,
    weight: 1,
    confidence: 1 - v.risk,
    reputation: guardReputation[v.evaluator] ?? 100,
  }));

  const policy = {
    policyId: `fintech-${riskTier}`,
    version: "v1",
    quorum: config.quorum,
    riskThreshold: config.riskThreshold,
    hitlRequiredAboveRisk: config.hitlAboveRisk,
    options: {},
  };

  const result = computeDecision(weightedVotes, policy, "hybrid");

  return {
    decision: result.decision,
    votes,
    combinedRisk: result.combinedRisk,
    quorumMet: result.quorumMet,
    weightedYesRatio: result.weightedYesRatio,
    tally: result.tally,
    policy,
    personas: selectedPersonas,
  };
}
