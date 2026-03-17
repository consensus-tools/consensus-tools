import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  parseVote,
  buildDiffGuardPrompt,
  computeSimpleDiff,
  generateSkillReviewPersonas,
  ReputationTracker,
  type AgentWithRep,
} from "@consensus-tools/evals";
import { finalizeVotes, computeDecision } from "@consensus-tools/guards";
import type { WeightedGuardVote, GuardPolicy } from "@consensus-tools/schemas";
import type { VersionEvalResult, EvalVote } from "./types.js";

type Model = "gpt-5-mini" | "claude-sonnet-4-6";

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

export async function callModel(
  modelId: Model,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  if (modelId === "claude-sonnet-4-6") {
    if (!anthropicClient) anthropicClient = new Anthropic();
    const response = await anthropicClient.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content[0]?.type === "text" ? response.content[0].text : "";
  }
  if (modelId === "gpt-5-mini") {
    if (!openaiClient) openaiClient = new OpenAI();
    const response = await openaiClient.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: maxTokens + 2000,
      messages: [{ role: "user", content: prompt }],
    });
    return response.choices[0]?.message?.content || "";
  }
  throw new Error(`Unknown model: ${modelId}`);
}

export async function runVersionEval(
  skillName: string,
  versionAContent: string,
  versionBContent: string,
  versionARef: string,
  versionBRef: string,
  model: Model,
  groundTruth?: string,
): Promise<{ single: VersionEvalResult; consensus: VersionEvalResult }> {
  const diff = computeSimpleDiff(versionAContent, versionBContent);
  if (!diff.trim() || (!diff.includes("+") && !diff.includes("-"))) {
    throw new Error("No meaningful differences between versions");
  }

  const personas = generateSkillReviewPersonas();
  const agents: AgentWithRep[] = personas.map((p) => ({
    ...p,
    reputation: 100,
  }));
  const proposalId = crypto.randomUUID();
  const batchId = crypto.randomUUID();

  // Single mode: 1 generalist
  const singleResult = await evalMode(
    "single",
    [agents[0]],
    diff,
    skillName,
    model,
    groundTruth,
  );

  // Brief delay between modes
  await new Promise((r) => setTimeout(r, 2000));

  // Consensus mode: 5 specialists
  const consensusResult = await evalMode(
    "consensus",
    agents,
    diff,
    skillName,
    model,
    groundTruth,
  );

  const base = {
    scenario: "skill-md" as const,
    model,
    skill: skillName,
    versionA: versionARef,
    versionB: versionBRef,
    proposalId,
    batchId,
    diffSummary: diff.slice(0, 500),
    fullDiff: diff,
  };

  return {
    single: {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      mode: "single",
      ...base,
      ...singleResult,
    },
    consensus: {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      mode: "consensus",
      ...base,
      ...consensusResult,
    },
  };
}

async function evalMode(
  mode: "single" | "consensus",
  agents: AgentWithRep[],
  diff: string,
  skillName: string,
  model: Model,
  groundTruth?: string,
): Promise<{
  votes: EvalVote[];
  decision: string;
  combinedRisk: number;
  quorumMet: boolean;
  weightedYesRatio: number;
  durationMs: number;
}> {
  const start = Date.now();
  const votes: EvalVote[] = [];

  for (const agent of agents) {
    const prompt = buildDiffGuardPrompt(agent, diff, skillName, groundTruth);
    let text = "";
    try {
      text = await callModel(model, prompt, 300);
    } catch (err: any) {
      if (err.status === 429 || err.code === "rate_limit_exceeded") {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          text = await callModel(model, prompt, 300);
        } catch {
          votes.push({
            agentId: agent.id,
            agentName: agent.name,
            vote: "REWRITE",
            risk: 0.5,
            reason: "Rate limited",
            reputation: agent.reputation,
          });
          continue;
        }
      } else {
        votes.push({
          agentId: agent.id,
          agentName: agent.name,
          vote: "REWRITE",
          risk: 0.5,
          reason: `Error: ${err.message?.slice(0, 80)}`,
          reputation: agent.reputation,
        });
        continue;
      }
    }
    votes.push(parseVote(text, agent));
    await new Promise((r) => setTimeout(r, 1500));
  }

  let decision: string,
    combinedRisk = 0,
    quorumMet = false,
    weightedYesRatio = 0;

  if (mode === "single") {
    const guardVotes = votes.map((v) => ({
      evaluator: v.agentId,
      vote: v.vote,
      risk: v.risk,
      reason: v.reason,
    }));
    const result = finalizeVotes(guardVotes, "publish", {
      hitlRequiredAboveRisk: 1.0,
    } as any);
    decision = result.decision;
    combinedRisk = result.risk_score;
    quorumMet = true;
    weightedYesRatio = votes[0]?.vote === "YES" ? 1 : 0;
  } else {
    const weightedVotes: WeightedGuardVote[] = votes.map((v) => ({
      evaluator: v.agentId,
      vote: v.vote,
      risk: v.risk,
      reason: v.reason,
      weight: 1,
      confidence: 0.8,
      reputation: v.reputation,
    }));
    const policy: GuardPolicy = {
      policyId: "demo",
      version: "v1",
      quorum: 0.6,
      riskThreshold: 0.6,
      hitlRequiredAboveRisk: 0.7,
      options: {},
    };
    const result = computeDecision(weightedVotes, policy);
    decision = result.decision;
    combinedRisk = result.combinedRisk;
    quorumMet = result.quorumMet;
    weightedYesRatio = result.weightedYesRatio;
  }

  return {
    votes,
    decision,
    combinedRisk,
    quorumMet,
    weightedYesRatio,
    durationMs: Date.now() - start,
  };
}
