import type { GuardVote, GuardEvaluateInput } from "@consensus-tools/schemas";
import type { AgentPersona } from "./personas.js";

export interface AiEvaluatorConfig {
  model?: string;
  apiKey?: string;
  /** Set to true to allow deterministic fallback when no API key is available.
   *  Without this flag, evaluateWithAiSdk will throw if no key is configured. */
  allowDeterministicFallback?: boolean;
}

/**
 * Evaluate a guard action using LLM-based agent personas.
 * Throws if no API key is configured unless allowDeterministicFallback is true.
 */
export async function evaluateWithAiSdk(
  input: GuardEvaluateInput,
  personas: AgentPersona[],
  config: AiEvaluatorConfig = {},
): Promise<GuardVote[]> {
  const apiKey = config.apiKey || process.env["OPENAI_API_KEY"];

  if (!apiKey) {
    if (!config.allowDeterministicFallback) {
      throw new Error(
        "consensus-tools/evals: No API key configured (set OPENAI_API_KEY or pass apiKey in config). " +
        "To use deterministic fallback instead, pass { allowDeterministicFallback: true }.",
      );
    }
    return deterministicFallback(input, personas);
  }

  // Dynamic import of ai SDK — only loads when API key is available
  try {
    // @ts-expect-error — ai is an optional peer dependency
    const { generateText } = await import("ai");
    // @ts-expect-error — @ai-sdk/openai is an optional peer dependency
    const { openai } = await import("@ai-sdk/openai");

    const model = (openai as any)(config.model || process.env["AI_MODEL"] || "gpt-4o-mini");
    const votes: GuardVote[] = [];

    for (const persona of personas) {
      const prompt = `You are ${persona.name} (${persona.role}). ${persona.systemPrompt}

Evaluate this action:
- Type: ${input.action.type}
- Payload: ${JSON.stringify(input.action.payload)}

Focus on: ${persona.evaluationFocus}

Respond with exactly one line in this format:
VOTE: <YES|NO|REWRITE> | RISK: <0.0-1.0> | REASON: <brief explanation>`;

      const result = await (generateText as any)({ model, prompt, maxTokens: 150 });
      const parsed = parseAiResponse(result.text, persona);
      votes.push(parsed);
    }

    return votes;
  } catch (err) {
    if (!config.allowDeterministicFallback) throw err;
    return deterministicFallback(input, personas);
  }
}

export function parseAiResponse(text: string, persona: AgentPersona): GuardVote {
  const voteMatch = /VOTE:\s*(YES|NO|REWRITE)/i.exec(text);
  const riskMatch = /RISK:\s*([\d.]+)/i.exec(text);
  const reasonMatch = /REASON:\s*(.+)/i.exec(text);

  return {
    evaluator: persona.id,
    vote: (voteMatch?.[1]?.toUpperCase() as "YES" | "NO" | "REWRITE") || "YES",
    risk: Math.min(1, Math.max(0, parseFloat(riskMatch?.[1] || "0.5"))),
    reason: reasonMatch?.[1]?.trim() || `${persona.name}: No issues detected`,
  };
}

function deterministicFallback(input: GuardEvaluateInput, personas: AgentPersona[]): GuardVote[] {
  return personas.map((persona) => ({
    evaluator: persona.id,
    vote: "YES" as const,
    risk: 0.3,
    reason: `${persona.name}: Deterministic fallback — no AI model configured`,
  }));
}
