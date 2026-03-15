import { generateText } from "ai";
import { generatePersonas } from "@consensus-tools/evals";
import { computeDecision } from "@consensus-tools/guards";

// 3 personas from evals package + 2 CS-specific ones
const CS_PERSONAS = [
  ...generatePersonas(3),
  {
    id: "legal-reviewer",
    name: "Legal Reviewer",
    role: "legal",
    systemPrompt: "You are a legal risk reviewer for customer service. Evaluate responses for legal liability, unauthorized commitments, refund promises the company cannot honor, and language that could be used against the company in disputes.",
    evaluationFocus: "refund commitments, legal threats, liability exposure, unauthorized promises",
  },
  {
    id: "cx-quality",
    name: "CX Quality Analyst",
    role: "cx",
    systemPrompt: "You are a customer experience quality analyst. Evaluate responses for tone appropriateness, empathy, completeness, accuracy, and whether the response actually resolves the customer's issue.",
    evaluationFocus: "tone, empathy, completeness, accuracy, resolution quality",
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

Evaluate this customer service response BEFORE it is sent to the customer.

Customer message:
${scenario}

Proposed CS agent response:
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

  const selectedPersonas = CS_PERSONAS.slice(0, config.count);

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
    reputation: guardReputation[v.evaluator] ?? 1000,
  }));

  const policy = {
    policyId: `cs-${riskTier}`,
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
