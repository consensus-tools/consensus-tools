import { generateText } from "ai";

const TIER_PROMPTS = {
  low: "Generate a simple, routine customer service scenario. The customer has a straightforward question about a product or service — no emotional charge, no urgency, no legal implications. Example: asking about shipping times or payment methods.",
  medium: "Generate a moderately complex customer service scenario. The customer is somewhat frustrated — maybe a delayed order or billing confusion. There's mild urgency but no threats or legal language.",
  high: "Generate a high-stakes customer service scenario. The customer is angry — a significant billing error, defective product, or repeated service failures. They may hint at wanting compensation or escalation. The agent's response needs careful handling.",
  critical: "Generate a critical customer service scenario. The customer is threatening legal action, demanding immediate refunds, mentioning lawsuits or attorneys, or describing a situation involving potential harm or major financial loss. The agent's response MUST be carefully vetted for legal liability, refund commitments, and compliance.",
};

export async function generateScenario(riskTier, model) {
  const prompt = TIER_PROMPTS[riskTier];
  if (!prompt) throw new Error(`Invalid risk tier: ${riskTier}`);

  const { text } = await generateText({
    model,
    prompt: `${prompt}

Write the scenario as a realistic customer message — first person, 2-4 sentences. Include enough detail to make the guard evaluation interesting. Output ONLY the customer message, nothing else.`,
    maxTokens: 300,
  });

  if (!text || text.trim().length < 10) {
    // Retry once on empty/too-short response
    const retry = await generateText({
      model,
      prompt: `${prompt}\n\nWrite a realistic 2-4 sentence customer message. Output ONLY the message.`,
      maxTokens: 300,
    });
    if (!retry.text || retry.text.trim().length < 10) {
      throw new Error("Failed to generate scenario after retry");
    }
    return retry.text.trim();
  }

  return text.trim();
}
