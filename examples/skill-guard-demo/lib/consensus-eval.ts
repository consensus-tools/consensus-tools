import { generateText } from "ai";
import type { LanguageModelV1 } from "ai";
import { computeEffectiveWeight } from "@consensus-tools/guards";
import { validateScore } from "@consensus-tools/evals";
import type { SkillAgent, JudgeScore, AgentEvalScore, ConsensusEvalResult } from "./types.js";

const MIN_QUORUM = 3;
const AGENT_DELAY_MS = 15_000;

/**
 * A/B comparative eval using multiple specialized agents with reputation weighting.
 *
 * Each agent scores both versions on clarity/completeness/actionability and picks
 * a winner. The composite score weights each agent by reputation. The winner is
 * the version with the most reputation-weighted votes.
 *
 *   ┌────────────┐     ┌────────────┐     ┌────────────┐
 *   │ Agent 1    │     │ Agent 2    │     │ Agent N    │
 *   │ rep: 107   │     │ rep: 99    │     │ rep: 124   │
 *   │ A:{c,co,a} │     │ A:{c,co,a} │     │ A:{c,co,a} │
 *   │ B:{c,co,a} │     │ B:{c,co,a} │     │ B:{c,co,a} │
 *   │ winner: B  │     │ winner: A  │     │ winner: B  │
 *   └─────┬──────┘     └─────┬──────┘     └─────┬──────┘
 *         │                  │                   │
 *         ▼                  ▼                   ▼
 *   ┌────────────────────────────────────────────────┐
 *   │   Reputation-Weighted Composite                 │
 *   │   composite[dim] = Σ(score[dim] × effWeight)    │
 *   │   winner = majority by rep-weight               │
 *   │   agreement = winnerWeight / totalWeight        │
 *   └────────────────────────────────────────────────┘
 */
export async function consensusJudge(
  skillName: string,
  versionA: string,
  versionB: string,
  agents: SkillAgent[],
  model: LanguageModelV1,
): Promise<ConsensusEvalResult> {
  // Short-circuit on identical inputs
  if (versionA === versionB) {
    const tieScore: JudgeScore = { clarity: 0, completeness: 0, actionability: 0, reasoning: "Identical versions" };
    return {
      aComposite: tieScore,
      bComposite: tieScore,
      winner: "TIE",
      agreement: 1.0,
      delta: { clarity: 0, completeness: 0, actionability: 0 },
      perAgent: [],
      quorumMet: true,
    };
  }

  const results: AgentEvalScore[] = [];

  for (const agent of agents) {
    try {
      const prompt = buildABPrompt(agent, skillName, versionA, versionB);
      const result = await generateText({ model, temperature: 0.7, prompt, maxTokens: 1024 });
      const parsed = parseABResponse(result.text, agent);
      if (parsed) results.push(parsed);
    } catch (err: any) {
      console.error(`  [consensus-eval] ${agent.name} failed: ${err.message}`);
      // Excluded from composite — don't default
    }
    // Rate limit delay between agents
    if (agent !== agents[agents.length - 1]) {
      await new Promise((r) => setTimeout(r, AGENT_DELAY_MS));
    }
  }

  // Quorum check
  if (results.length < MIN_QUORUM) {
    return {
      aComposite: { clarity: 0, completeness: 0, actionability: 0, reasoning: "Below quorum" },
      bComposite: { clarity: 0, completeness: 0, actionability: 0, reasoning: "Below quorum" },
      winner: "UNKNOWN",
      agreement: 0,
      delta: { clarity: 0, completeness: 0, actionability: 0 },
      perAgent: results,
      quorumMet: false,
    };
  }

  // Compute reputation-weighted composite
  const aComposite = weightedComposite(results.map((r) => ({ scores: r.aScores, reputation: r.reputation })));
  const bComposite = weightedComposite(results.map((r) => ({ scores: r.bScores, reputation: r.reputation })));

  // Determine winner by rep-weighted majority vote
  let weightA = 0;
  let weightB = 0;
  for (const r of results) {
    const ew = computeEffectiveWeight(1, r.reputation, "reputation");
    if (r.winner === "A") weightA += ew;
    else if (r.winner === "B") weightB += ew;
    // TIE votes don't count toward either side
  }

  const totalVoteWeight = weightA + weightB;
  let winner: "A" | "B" | "TIE";
  let agreement: number;

  if (totalVoteWeight === 0) {
    winner = "TIE";
    agreement = 1.0;
  } else if (weightA > weightB) {
    winner = "A";
    agreement = weightA / totalVoteWeight;
  } else if (weightB > weightA) {
    winner = "B";
    agreement = weightB / totalVoteWeight;
  } else {
    winner = "TIE";
    agreement = 0.5;
  }

  return {
    aComposite,
    bComposite,
    winner,
    agreement,
    delta: {
      clarity: bComposite.clarity - aComposite.clarity,
      completeness: bComposite.completeness - aComposite.completeness,
      actionability: bComposite.actionability - aComposite.actionability,
    },
    perAgent: results,
    quorumMet: true,
  };
}

function buildABPrompt(agent: SkillAgent, skillName: string, versionA: string, versionB: string): string {
  return `You are ${agent.name} (${agent.role}). ${agent.systemPrompt}

You are comparing two versions of ${skillName}/SKILL.md. Score EACH version independently, then declare which is better.

Focus on: ${agent.evaluationFocus}

Rate each version on three dimensions (1-5 scale):
- clarity: Can an agent follow the instructions without ambiguity?
- completeness: Is everything the agent needs documented? No guessing?
- actionability: Can an agent execute the full task from this document alone?

VERSION A:
${versionA}

VERSION B:
${versionB}

Respond with ONLY valid JSON:
{
  "a_scores": {"clarity": N, "completeness": N, "actionability": N},
  "b_scores": {"clarity": N, "completeness": N, "actionability": N},
  "winner": "A" or "B" or "TIE",
  "reasoning": "brief explanation of key differences"
}`;
}

function parseABResponse(text: string, agent: SkillAgent): AgentEvalScore | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const raw = JSON.parse(jsonMatch[0]);

    const aScores = raw.a_scores || {};
    const bScores = raw.b_scores || {};
    const winner = (raw.winner || "").toUpperCase();

    return {
      agentId: agent.id,
      agentName: agent.name,
      reputation: agent.reputation,
      aScores: {
        clarity: validateScore(aScores.clarity),
        completeness: validateScore(aScores.completeness),
        actionability: validateScore(aScores.actionability),
        reasoning: "",
      },
      bScores: {
        clarity: validateScore(bScores.clarity),
        completeness: validateScore(bScores.completeness),
        actionability: validateScore(bScores.actionability),
        reasoning: "",
      },
      winner: winner === "A" ? "A" : winner === "B" ? "B" : "TIE",
      reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "",
    };
  } catch {
    return null;
  }
}

function weightedComposite(
  entries: { scores: JudgeScore; reputation: number }[],
): JudgeScore {
  let totalWeight = 0;
  let wClarity = 0;
  let wCompleteness = 0;
  let wActionability = 0;
  const reasons: string[] = [];

  for (const e of entries) {
    const w = computeEffectiveWeight(1, e.reputation, "reputation");
    totalWeight += w;
    wClarity += e.scores.clarity * w;
    wCompleteness += e.scores.completeness * w;
    wActionability += e.scores.actionability * w;
  }

  if (totalWeight === 0) {
    return { clarity: 0, completeness: 0, actionability: 0, reasoning: "No data" };
  }

  return {
    clarity: Math.round((wClarity / totalWeight) * 100) / 100,
    completeness: Math.round((wCompleteness / totalWeight) * 100) / 100,
    actionability: Math.round((wActionability / totalWeight) * 100) / 100,
    reasoning: `Weighted composite from ${entries.length} agents`,
  };
}
