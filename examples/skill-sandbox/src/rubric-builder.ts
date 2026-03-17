import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  generateSkillReviewPersonas,
  type AgentWithRep,
} from "@consensus-tools/evals";
import type { Rubric, RubricVote } from "./types.js";

type Model = "gpt-5-mini" | "claude-sonnet-4-6";

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

export async function callModel(
  modelId: Model,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  if (modelId === "claude-sonnet-4-6") {
    if (!anthropicClient) anthropicClient = new Anthropic();
    const response = await anthropicClient.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      temperature: 0.3,
      system,
      messages: [{ role: "user", content: user }],
    });
    return response.content[0]?.type === "text" ? response.content[0].text : "";
  }
  if (modelId === "gpt-5-mini") {
    if (!openaiClient) openaiClient = new OpenAI();
    const response = await openaiClient.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: maxTokens + 2000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return response.choices[0]?.message?.content || "";
  }
  throw new Error(`Unknown model: ${modelId}`);
}

function extractJSON(text: string): string {
  // Try to extract JSON from markdown code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  // Try raw JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return text;
}

function parseRubricResponse(
  text: string,
  agentId: string,
  agentName: string,
): RubricVote | null {
  try {
    const raw = extractJSON(text);
    const parsed = JSON.parse(raw);
    return {
      agentId,
      agentName,
      claims: Array.isArray(parsed.claims) ? parsed.claims : [],
      weakPoints: Array.isArray(parsed.weakPoints) ? parsed.weakPoints : [],
      suggestedPrompt: typeof parsed.suggestedPrompt === "string" ? parsed.suggestedPrompt : "",
    };
  } catch {
    return null;
  }
}

export async function buildRubric(
  skillContent: string,
  repoReadme: string,
  repoFileListing: string,
  model: Model,
): Promise<Rubric> {
  const personas = generateSkillReviewPersonas();
  const agents: AgentWithRep[] = personas.map((p) => ({
    ...p,
    reputation: 100,
  }));

  const votes: RubricVote[] = [];

  for (const agent of agents) {
    const systemPrompt = `You are ${agent.name}, a ${agent.focus} specialist.
Your role: ${agent.description}
Focus areas: ${agent.focus}

You are analyzing a skill definition (SKILL.md) to build a test rubric. Your job is to:
1. Identify what the skill claims to do
2. Identify areas where the skill is most likely to hallucinate when executed against a real repo
3. Suggest the best prompt to stress-test this skill against a task manager repo

Respond ONLY with valid JSON in this exact format:
{
  "claims": ["claim 1", "claim 2", ...],
  "weakPoints": ["weak point 1", "weak point 2", ...],
  "suggestedPrompt": "the prompt to test this skill..."
}`;

    const userPrompt = `## SKILL.md Content
${skillContent}

## Target Repository README
${repoReadme}

## Target Repository File Listing
${repoFileListing}

Analyze this skill and produce your rubric assessment as JSON.`;

    let text = "";
    try {
      text = await callModel(model, systemPrompt, userPrompt, 1500);
    } catch (err: any) {
      if (err.status === 429 || err.code === "rate_limit_exceeded") {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          text = await callModel(model, systemPrompt, userPrompt, 1500);
        } catch {
          continue;
        }
      } else {
        console.error(`Agent ${agent.name} failed:`, err.message);
        continue;
      }
    }

    let vote = parseRubricResponse(text, agent.id, agent.name);

    // Retry once on parse failure with stricter prompt
    if (!vote) {
      console.log(`Retrying ${agent.name} with stricter prompt...`);
      const retryPrompt = `${userPrompt}

IMPORTANT: Your response must be ONLY valid JSON, no markdown, no explanation. Just the JSON object with keys: claims, weakPoints, suggestedPrompt.`;
      try {
        text = await callModel(model, systemPrompt, retryPrompt, 1500);
        vote = parseRubricResponse(text, agent.id, agent.name);
      } catch {
        // skip this agent
      }
    }

    if (vote) {
      votes.push(vote);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  if (votes.length === 0) {
    throw new Error("No agents produced valid rubric votes");
  }

  // Merge: union of all claims and weak points
  const allClaims = new Set<string>();
  const allWeakPoints = new Set<string>();
  for (const v of votes) {
    for (const c of v.claims) allClaims.add(c);
    for (const w of v.weakPoints) allWeakPoints.add(w);
  }

  // Pick test prompt: majority vote or highest-reputation agent's prompt
  const promptCounts = new Map<string, number>();
  for (const v of votes) {
    if (v.suggestedPrompt) {
      promptCounts.set(v.suggestedPrompt, (promptCounts.get(v.suggestedPrompt) || 0) + 1);
    }
  }

  let testPrompt = votes[0].suggestedPrompt; // fallback: first agent (highest rep)
  let maxCount = 0;
  for (const [prompt, count] of promptCounts) {
    if (count > maxCount) {
      maxCount = count;
      testPrompt = prompt;
    }
  }

  return {
    claims: [...allClaims],
    weakPoints: [...allWeakPoints],
    testPrompt,
    agentVotes: votes,
  };
}
