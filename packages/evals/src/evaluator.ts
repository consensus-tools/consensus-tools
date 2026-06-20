import type { GuardVote, GuardEvaluateInput } from "@consensus-tools/schemas";
import type { AgentPersona } from "./personas.js";

/** Default model for the Anthropic provider (the preferred path). */
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";
/** Default model for the OpenAI fallback path. */
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

export interface AiEvaluatorConfig {
  /** Override the model id. Defaults to DEFAULT_ANTHROPIC_MODEL (or DEFAULT_OPENAI_MODEL
   *  when the provider resolves to openai). Also overridable via the AI_MODEL env var. */
  model?: string;
  /** API key for the resolved provider. config.apiKey is provider-ambiguous, so pass
   *  `provider` alongside it when it isn't an Anthropic key. */
  apiKey?: string;
  /** Force the provider. Defaults to "anthropic" (the preferred path). When unset and
   *  no Anthropic key is present, falls back to "openai" if OPENAI_API_KEY is set. */
  provider?: "anthropic" | "openai";
  /** Set to true to allow deterministic fallback when no API key is available.
   *  Without this flag, evaluateWithAiSdk will throw if no key is configured. */
  allowDeterministicFallback?: boolean;
}

/**
 * Evaluate a guard action using LLM-based agent personas.
 *
 * Anthropic-first: uses ANTHROPIC_API_KEY (or config.apiKey) with @ai-sdk/anthropic
 * and DEFAULT_ANTHROPIC_MODEL, matching the toolkit's "default to the latest Claude
 * model" guidance and core's createLlmFn. Falls back to OPENAI_API_KEY +
 * @ai-sdk/openai only when no Anthropic key is present.
 *
 * Throws if no API key is configured unless allowDeterministicFallback is true.
 */
export async function evaluateWithAiSdk(
  input: GuardEvaluateInput,
  personas: AgentPersona[],
  config: AiEvaluatorConfig = {},
): Promise<GuardVote[]> {
  // Anthropic-first: prefer Anthropic unless told otherwise. When no provider is
  // forced and no Anthropic key is present, fall back to OpenAI if its key is set.
  const provider: "anthropic" | "openai" =
    config.provider ??
    ((config.apiKey || process.env["ANTHROPIC_API_KEY"])
      ? "anthropic"
      : process.env["OPENAI_API_KEY"]
        ? "openai"
        : "anthropic");

  const apiKey =
    config.apiKey ??
    (provider === "anthropic" ? process.env["ANTHROPIC_API_KEY"] : process.env["OPENAI_API_KEY"]);

  if (!apiKey) {
    if (!config.allowDeterministicFallback) {
      throw new Error(
        "consensus-tools/evals: No API key configured (set ANTHROPIC_API_KEY or " +
        "OPENAI_API_KEY, or pass apiKey in config). " +
        "To use deterministic fallback instead, pass { allowDeterministicFallback: true }.",
      );
    }
    return deterministicFallback(input, personas);
  }

  // Dynamic import of the AI SDK — only loads when an API key is available, so the
  // provider SDKs stay optional peer deps (never bundled into the runtime).
  // `as string` casts defeat literal-specifier type resolution so the package
  // typechecks whether or not these optional peer deps are installed.
  try {
    const { generateText } = await import("ai" as string);

    let model: unknown;
    if (provider === "anthropic") {
      const { anthropic } = await import("@ai-sdk/anthropic" as string);
      model = (anthropic as any)(config.model || process.env["AI_MODEL"] || DEFAULT_ANTHROPIC_MODEL);
    } else {
      const { openai } = await import("@ai-sdk/openai" as string);
      model = (openai as any)(config.model || process.env["AI_MODEL"] || DEFAULT_OPENAI_MODEL);
    }

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
