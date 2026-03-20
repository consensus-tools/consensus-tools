/**
 * Skill version eval runner.
 *
 * Single mode: 1 LLM judge scores each version on clarity/completeness/actionability.
 * Consensus mode: 5 specialist agents each score both versions, scores aggregated.
 *
 * Uses gstack's LLM-as-judge pattern (not diff guards).
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  generateSkillReviewPersonas,
  computeSimpleDiff,
  parseVote,
  buildDiffGuardPrompt,
  type AgentWithRep,
} from "@consensus-tools/evals";
import { computeDecision } from "@consensus-tools/guards";
import type { WeightedGuardVote, GuardPolicy } from "@consensus-tools/schemas";
import type {
  JudgeScore,
  AgentJudgeResult,
  VersionScore,
  VersionEvalResult,
  DiffGuardResult,
  DiffGuardVote,
} from "./types.js";

type Model = "gpt-5-mini" | "claude-sonnet-4-6";

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

async function callModel(modelId: Model, prompt: string, maxTokens: number): Promise<string> {
  if (modelId === "claude-sonnet-4-6") {
    if (!anthropicClient) anthropicClient = new Anthropic();
    const response = await anthropicClient.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
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

// ─── Judge prompt (gstack pattern) ───

function buildJudgePrompt(skillName: string, content: string, agentContext?: string): string {
  const agentLine = agentContext
    ? `\nYou are evaluating from the perspective of: ${agentContext}\n`
    : "";

  return `You are evaluating documentation quality for an AI coding agent's skill reference.
${agentLine}
The agent reads this SKILL.md to learn how to execute a workflow. It needs to:
1. Understand what each command/step does
2. Know what arguments, flags, and parameters to use
3. Know valid values for enum-like parameters
4. Construct correct invocations without guessing
5. Handle edge cases and errors correctly

Rate the following ${skillName}/SKILL.md on three dimensions (1-5 scale):

- **clarity** (1-5): Can an agent understand what each command/step does from the description alone?
- **completeness** (1-5): Are arguments, valid values, edge cases, and important behaviors documented? Would an agent need to guess anything?
- **actionability** (1-5): Can an agent execute the full workflow from this reference alone?

Scoring guide:
- 5: Excellent — no ambiguity, all info present, agent can execute perfectly
- 4: Good — minor gaps an experienced agent could infer
- 3: Adequate — some guessing required, missing details
- 2: Poor — significant info missing, agent would struggle
- 1: Unusable — agent would fail without external help

Respond with ONLY valid JSON in this exact format:
{"clarity": N, "completeness": N, "actionability": N, "reasoning": "brief explanation of gaps or strengths"}

Here is the ${skillName}/SKILL.md to evaluate:

${content}`;
}

function parseJudgeScore(text: string): JudgeScore {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { clarity: 2, completeness: 2, actionability: 2, reasoning: "Failed to parse judge response" };
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      clarity: clampScore(parsed.clarity),
      completeness: clampScore(parsed.completeness),
      actionability: clampScore(parsed.actionability),
      reasoning: parsed.reasoning || "",
    };
  } catch {
    return { clarity: 2, completeness: 2, actionability: 2, reasoning: "JSON parse error" };
  }
}

function clampScore(v: unknown): number {
  const n = Number(v);
  if (isNaN(n)) return 2;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function avgScore(s: JudgeScore): number {
  return (s.clarity + s.completeness + s.actionability) / 3;
}

function aggregateScores(results: AgentJudgeResult[]): JudgeScore {
  const n = results.length;
  if (n === 0) return { clarity: 2, completeness: 2, actionability: 2, reasoning: "No agent results" };

  const clarity = results.reduce((s, r) => s + r.scores.clarity, 0) / n;
  const completeness = results.reduce((s, r) => s + r.scores.completeness, 0) / n;
  const actionability = results.reduce((s, r) => s + r.scores.actionability, 0) / n;
  const reasons = results.map(r => `[${r.agentName}] ${r.scores.reasoning}`).join("; ");

  return {
    clarity: Math.round(clarity * 10) / 10,
    completeness: Math.round(completeness * 10) / 10,
    actionability: Math.round(actionability * 10) / 10,
    reasoning: reasons,
  };
}

// ─── Score one version with one agent ───

async function judgeVersion(
  skillName: string,
  content: string,
  model: Model,
  agentContext?: string,
): Promise<JudgeScore> {
  const prompt = buildJudgePrompt(skillName, content, agentContext);
  try {
    const text = await callModel(model, prompt, 1024);
    return parseJudgeScore(text);
  } catch (err: any) {
    if (err.status === 429 || err.code === "rate_limit_exceeded") {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const text = await callModel(model, prompt, 1024);
        return parseJudgeScore(text);
      } catch {
        return { clarity: 2, completeness: 2, actionability: 2, reasoning: "Rate limited" };
      }
    }
    return { clarity: 2, completeness: 2, actionability: 2, reasoning: `Error: ${err.message?.slice(0, 80)}` };
  }
}

// ─── Main eval runner ───

export async function runVersionEval(
  skillName: string,
  versionAContent: string,
  versionBContent: string,
  versionARef: string,
  versionBRef: string,
  model: Model,
): Promise<{ single: VersionEvalResult; consensus: VersionEvalResult }> {
  const diff = computeSimpleDiff(versionAContent, versionBContent);
  const proposalId = crypto.randomUUID();

  // ── Single mode: 1 generalist judge scores both versions ──
  const singleStart = Date.now();
  console.log("  [single] Scoring version A...");
  const singleScoreA = await judgeVersion(skillName, versionAContent, model);
  await new Promise(r => setTimeout(r, 1500));
  console.log("  [single] Scoring version B...");
  const singleScoreB = await judgeVersion(skillName, versionBContent, model);
  const singleDuration = Date.now() - singleStart;

  const singleAvgA = avgScore(singleScoreA);
  const singleAvgB = avgScore(singleScoreB);

  // ── Consensus mode: 5 specialist agents each score both versions ──
  await new Promise(r => setTimeout(r, 2000));
  const consensusStart = Date.now();
  const personas = generateSkillReviewPersonas();
  const agentResultsA: AgentJudgeResult[] = [];
  const agentResultsB: AgentJudgeResult[] = [];

  for (const persona of personas) {
    const ctx = `${persona.name} (${persona.role}) — focus: ${persona.evaluationFocus}`;
    console.log(`  [consensus] ${persona.name} scoring version A...`);
    const scoreA = await judgeVersion(skillName, versionAContent, model, ctx);
    agentResultsA.push({ agentId: persona.id, agentName: persona.name, scores: scoreA });
    await new Promise(r => setTimeout(r, 1500));

    console.log(`  [consensus] ${persona.name} scoring version B...`);
    const scoreB = await judgeVersion(skillName, versionBContent, model, ctx);
    agentResultsB.push({ agentId: persona.id, agentName: persona.name, scores: scoreB });
    await new Promise(r => setTimeout(r, 1500));
  }
  const consensusDuration = Date.now() - consensusStart;

  const consensusScoreA = aggregateScores(agentResultsA);
  const consensusScoreB = aggregateScores(agentResultsB);
  const consensusAvgA = avgScore(consensusScoreA);
  const consensusAvgB = avgScore(consensusScoreB);

  // ── Build results ──
  function buildResult(
    mode: "single" | "consensus",
    scoreA: JudgeScore,
    scoreB: JudgeScore,
    agentsA?: AgentJudgeResult[],
    agentsB?: AgentJudgeResult[],
    duration?: number,
  ): VersionEvalResult {
    const aAvg = avgScore(scoreA);
    const bAvg = avgScore(scoreB);
    const delta = Math.round((bAvg - aAvg) * 100) / 100;
    const winner = delta > 0.2 ? "B" : delta < -0.2 ? "A" : "TIE";

    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      mode,
      model,
      skill: skillName,
      versionA: { ref: versionARef, average: Math.round(aAvg * 100) / 100, scores: scoreA, agentResults: agentsA },
      versionB: { ref: versionBRef, average: Math.round(bAvg * 100) / 100, scores: scoreB, agentResults: agentsB },
      winner,
      delta,
      proposalId,
      diffSummary: diff.slice(0, 500),
      fullDiff: diff,
      durationMs: duration || 0,
    };
  }

  return {
    single: buildResult("single", singleScoreA, singleScoreB, undefined, undefined, singleDuration),
    consensus: buildResult("consensus", consensusScoreA, consensusScoreB, agentResultsA, agentResultsB, consensusDuration),
  };
}

// ─── Optional diff guard (triggered by button) ───

export async function runDiffGuard(
  skillName: string,
  versionAContent: string,
  versionBContent: string,
  model: Model,
  proposalId: string,
): Promise<DiffGuardResult> {
  const diff = computeSimpleDiff(versionAContent, versionBContent);
  const start = Date.now();
  const personas = generateSkillReviewPersonas();
  const agents: AgentWithRep[] = personas.map(p => ({ ...p, reputation: 100 }));
  const votes: DiffGuardVote[] = [];

  for (const agent of agents) {
    const prompt = buildDiffGuardPrompt(agent, diff, skillName);
    let text = "";
    try {
      text = await callModel(model, prompt, 300);
    } catch (err: any) {
      votes.push({ agentId: agent.id, agentName: agent.name, vote: "REWRITE", risk: 0.5, reason: `Error: ${err.message?.slice(0, 80)}` });
      continue;
    }
    const parsed = parseVote(text, agent);
    votes.push({ agentId: parsed.agentId, agentName: parsed.agentName, vote: parsed.vote, risk: parsed.risk, reason: parsed.reason });
    await new Promise(r => setTimeout(r, 1500));
  }

  const weightedVotes: WeightedGuardVote[] = votes.map(v => ({
    evaluator: v.agentId, vote: v.vote, risk: v.risk, reason: v.reason,
    weight: 1, confidence: 0.8, reputation: 100,
  }));
  const policy: GuardPolicy = { policyId: "diff-guard", version: "v1", quorum: 0.6, riskThreshold: 0.6, hitlRequiredAboveRisk: 0.7, options: {} };
  const result = computeDecision(weightedVotes, policy);

  return {
    id: crypto.randomUUID(),
    proposalId,
    timestamp: new Date().toISOString(),
    votes,
    decision: result.decision,
    combinedRisk: result.combinedRisk,
    durationMs: Date.now() - start,
  };
}
