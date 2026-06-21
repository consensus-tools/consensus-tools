import { computeEffectiveWeight } from "@consensus-tools/guards";
import { validateScore } from "./validation.js";
import type { AgentPersona } from "./personas.js";
import type { JudgeScore, AgentEvalScore, ConsensusEvalResult, PromptBuilder } from "./types.js";

export interface ConsensusEvalOptions {
  /** Minimum agents required for a valid result (default: 3) */
  minQuorum?: number;
  /** Delay between agent calls in ms (default: 15000) */
  agentDelayMs?: number;
  /** LLM temperature (default: 0.7) */
  temperature?: number;
  /** Max tokens for LLM response (default: 1024) */
  maxTokens?: number;
  /** Called when an agent's LLM call fails. Library does not log by default. */
  onAgentError?: (agent: { id: string; name: string }, error: Error) => void;
}

/**
 * A/B comparative eval using multiple specialized agents with reputation weighting.
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
 *
 * @param versionA - First document version
 * @param versionB - Second document version
 * @param agents - Agent personas with reputation scores
 * @param model - Vercel AI SDK LanguageModelV1 instance
 * @param promptBuilder - Builds the A/B prompt per agent (domain-specific)
 * @param options - Quorum, delay, temperature settings
 */
export async function consensusEval(
  versionA: string,
  versionB: string,
  agents: (AgentPersona & { reputation: number })[],
  model: unknown,
  promptBuilder: PromptBuilder,
  options: ConsensusEvalOptions = {},
): Promise<ConsensusEvalResult> {
  const minQuorum = options.minQuorum ?? 3;
  const agentDelayMs = options.agentDelayMs ?? 15_000;
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 1024;

  // Short-circuit on identical inputs
  if (versionA === versionB) {
    const tieScore: JudgeScore = { clarity: 0, completeness: 0, actionability: 0, reasoning: "Identical versions" };
    return {
      aComposite: tieScore, bComposite: tieScore,
      winner: "TIE", agreement: 1.0,
      delta: { clarity: 0, completeness: 0, actionability: 0 },
      perAgent: [], quorumMet: true,
    };
  }

  // Dynamic import — ai SDK is an optional peer dependency
  let generateText: any;
  try {
    const aiModule = await import("ai" as string);
    generateText = aiModule.generateText;
  } catch (err) {
    throw new Error("consensusEval requires the 'ai' package. Install: npm install ai @ai-sdk/anthropic", { cause: err });
  }

  const results: AgentEvalScore[] = [];

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]!;
    try {
      const prompt = promptBuilder(agent, versionA, versionB);
      const result = await generateText({ model, temperature, prompt, maxTokens });
      const parsed = parseABResponse(result.text, agent);
      if (parsed) results.push(parsed);
    } catch (err: any) {
      // Excluded from composite — don't default
      options.onAgentError?.(agent, err);
    }
    if (i < agents.length - 1) {
      await new Promise((r) => setTimeout(r, agentDelayMs));
    }
  }

  // Quorum check
  if (results.length < minQuorum) {
    const empty: JudgeScore = { clarity: 0, completeness: 0, actionability: 0, reasoning: "Below quorum" };
    return {
      aComposite: empty, bComposite: empty,
      winner: "UNKNOWN", agreement: 0,
      delta: { clarity: 0, completeness: 0, actionability: 0 },
      perAgent: results, quorumMet: false,
    };
  }

  const aComposite = weightedComposite(results.map((r) => ({ scores: r.aScores, reputation: r.reputation })));
  const bComposite = weightedComposite(results.map((r) => ({ scores: r.bScores, reputation: r.reputation })));

  // Winner by rep-weighted majority vote
  let weightA = 0;
  let weightB = 0;
  for (const r of results) {
    const ew = computeEffectiveWeight(1, r.reputation, "reputation");
    if (r.winner === "A") weightA += ew;
    else if (r.winner === "B") weightB += ew;
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
    aComposite, bComposite, winner, agreement,
    delta: {
      clarity: bComposite.clarity - aComposite.clarity,
      completeness: bComposite.completeness - aComposite.completeness,
      actionability: bComposite.actionability - aComposite.actionability,
    },
    perAgent: results, quorumMet: true,
  };
}

/** Parse an A/B JSON response from an agent. Returns null on parse failure. */
export function parseABResponse(
  text: string,
  agent: AgentPersona & { reputation: number },
): AgentEvalScore | null {
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

/** Compute reputation-weighted composite scores. */
export function weightedComposite(
  entries: { scores: JudgeScore; reputation: number }[],
): JudgeScore {
  let totalWeight = 0;
  let wClarity = 0;
  let wCompleteness = 0;
  let wActionability = 0;

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
