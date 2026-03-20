import {
  generateSkillReviewPersonas,
  type AgentWithRep,
} from "@consensus-tools/evals";
import { computeDecision } from "@consensus-tools/guards";
import type { WeightedGuardVote, GuardPolicy } from "@consensus-tools/schemas";
import { callModel } from "./rubric-builder.js";
import { loadFixtureReadme, loadFixtureFiles } from "./executor.js";
import type { Rubric, CheckResult, HallucinationFinding } from "./types.js";

type Model = "gpt-5-mini" | "claude-sonnet-4-6";

function extractJSON(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return text;
}

function parseCheckResponse(
  text: string,
  agentId: string,
  agentName: string,
): CheckResult {
  try {
    const raw = extractJSON(text);
    const parsed = JSON.parse(raw);
    const vote = ["YES", "NO", "REWRITE"].includes(parsed.vote) ? parsed.vote : "REWRITE";
    const risk = typeof parsed.risk === "number" ? Math.max(0, Math.min(1, parsed.risk)) : 0.5;
    const findings: HallucinationFinding[] = Array.isArray(parsed.findings)
      ? parsed.findings.map((f: any) => ({
          category: ["fabricated_file", "fabricated_command", "wrong_behavior", "contradicts_repo", "accurate"].includes(f.category)
            ? f.category
            : "wrong_behavior",
          description: String(f.description || ""),
          severity: ["high", "medium", "low"].includes(f.severity) ? f.severity : "medium",
          evidence: String(f.evidence || ""),
        }))
      : [];
    return {
      agentId,
      agentName,
      vote,
      risk,
      findings,
      reason: String(parsed.reason || ""),
    };
  } catch {
    return {
      agentId,
      agentName,
      vote: "REWRITE",
      risk: 0.5,
      findings: [],
      reason: "Failed to parse checker response",
    };
  }
}

export async function checkHallucinations(
  executionOutput: string,
  rubric: Rubric,
  model: Model,
): Promise<{
  checkResults: CheckResult[];
  decision: string;
  combinedRisk: number;
  hallucinationCount: number;
}> {
  const personas = generateSkillReviewPersonas();
  const agents: AgentWithRep[] = personas.map((p) => ({
    ...p,
    reputation: 100,
  }));

  const readme = loadFixtureReadme();
  const { listing } = loadFixtureFiles();

  const checkResults: CheckResult[] = [];

  for (const agent of agents) {
    const systemPrompt = `You are ${agent.name}. Check this skill's output for hallucinations.

SKILL CLAIMS (from rubric):
${rubric.claims.map((c) => `- ${c}`).join("\n")}

KNOWN WEAK POINTS:
${rubric.weakPoints.map((w) => `- ${w}`).join("\n")}

ACTUAL PROJECT STATE:
${readme}

${listing}

SKILL OUTPUT TO CHECK:
${executionOutput}

For each issue found, classify as:
- fabricated_file: references a file that doesn't exist
- fabricated_command: suggests a command/flag that doesn't exist
- wrong_behavior: describes behavior that contradicts the source
- contradicts_repo: makes claims that conflict with the repo's actual state
- accurate: correctly describes something real

Respond ONLY with valid JSON:
{
  "vote": "YES|NO|REWRITE",
  "risk": 0.0-1.0,
  "findings": [{ "category": "...", "description": "...", "severity": "high|medium|low", "evidence": "..." }],
  "reason": "one-line summary"
}`;

    const userPrompt = `Analyze the skill output above for hallucinations. Produce your assessment as JSON.`;

    let text = "";
    try {
      text = await callModel(model, systemPrompt, userPrompt, 2000);
    } catch (err: any) {
      if (err.status === 429 || err.code === "rate_limit_exceeded") {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          text = await callModel(model, systemPrompt, userPrompt, 2000);
        } catch {
          checkResults.push({
            agentId: agent.id,
            agentName: agent.name,
            vote: "REWRITE",
            risk: 0.5,
            findings: [],
            reason: "Rate limited",
          });
          continue;
        }
      } else {
        checkResults.push({
          agentId: agent.id,
          agentName: agent.name,
          vote: "REWRITE",
          risk: 0.5,
          findings: [],
          reason: `Error: ${err.message?.slice(0, 80)}`,
        });
        continue;
      }
    }

    checkResults.push(parseCheckResponse(text, agent.id, agent.name));
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Use computeDecision for final consensus
  const weightedVotes: WeightedGuardVote[] = checkResults.map((r) => ({
    evaluator: r.agentId,
    vote: r.vote,
    risk: r.risk,
    reason: r.reason,
    weight: 1,
    confidence: 0.8,
    reputation: 100,
  }));

  const policy: GuardPolicy = {
    policyId: "hallucination-check",
    version: "v1",
    quorum: 0.6,
    riskThreshold: 0.6,
    hitlRequiredAboveRisk: 0.7,
    options: {},
  };

  const result = computeDecision(weightedVotes, policy);

  // Count hallucinations (non-accurate findings)
  let hallucinationCount = 0;
  for (const cr of checkResults) {
    for (const f of cr.findings) {
      if (f.category !== "accurate") hallucinationCount++;
    }
  }

  return {
    checkResults,
    decision: result.decision,
    combinedRisk: result.combinedRisk,
    hallucinationCount,
  };
}
