import type { LlmFn } from "./explain.js";

/**
 * Creates an LLM callback from environment API keys.
 * Prefers Anthropic when both keys are available.
 * Uses dynamic imports so neither SDK is a runtime dependency.
 *
 * @throws Error if neither key is provided
 */
export async function createLlmFn(opts?: {
  anthropicKey?: string;
  openaiKey?: string;
  anthropicModel?: string;
  openaiModel?: string;
  maxTokens?: number;
}): Promise<LlmFn> {
  const anthropicKey = opts?.anthropicKey ?? process.env.ANTHROPIC_API_KEY;
  const openaiKey = opts?.openaiKey ?? process.env.OPENAI_API_KEY;
  const maxTokens = opts?.maxTokens ?? 1024;

  if (!anthropicKey && !openaiKey) {
    throw new Error("Set ANTHROPIC_API_KEY or OPENAI_API_KEY to use LLM features");
  }

  if (anthropicKey) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional runtime dep
    const Anthropic = (await import("@anthropic-ai/sdk" as string)).default;
    const client = new Anthropic({ apiKey: anthropicKey });
    const model = opts?.anthropicModel ?? "claude-sonnet-4-20250514";
    return async (prompt: string) => {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });
      const block = res.content?.[0];
      return block?.type === "text" ? block.text : "";
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional runtime dep
  const OpenAI = (await import("openai" as string)).default;
  const client = new OpenAI({ apiKey: openaiKey });
  const model = opts?.openaiModel ?? "gpt-4o-mini";
  return async (prompt: string) => {
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    });
    return res.choices?.[0]?.message?.content ?? "";
  };
}
