import { generateText } from "ai";

const TIER_PROMPTS = {
  low: "Generate a routine payment processing scenario. A standard domestic transaction under $10K — ACH transfer, direct deposit, or card payment. No flags, no urgency, no compliance concerns. Example: a small business paying a vendor invoice.",
  medium: "Generate a moderately flagged payment scenario. A transaction between $10K-$100K with a minor anomaly — unusual timing, first-time recipient, or velocity spike. The fraud detection system flagged it for review but it's likely legitimate. Include enough detail to make the risk assessment interesting.",
  high: "Generate a high-value wire transfer scenario. A transaction between $100K-$250K involving either a new international recipient, a jurisdiction with elevated AML risk, or a pattern that deviates from the sender's historical behavior. The compliance team would want to review this before it clears.",
  critical: "Generate a critical transaction scenario modeled on a real incident: a $340K wire transfer to a flagged jurisdiction. The transaction approval agent has already returned APPROVE, but the fraud detection agent flagged anomalies — the recipient is in a jurisdiction on the OFAC watchlist, the amount exceeds the sender's historical maximum by 4x, and the transfer was initiated outside business hours. This is the kind of transaction where agent disagreement MUST surface before the wire clears.",
};

export async function generateScenario(riskTier, model) {
  const prompt = TIER_PROMPTS[riskTier];
  if (!prompt) throw new Error(`Invalid risk tier: ${riskTier}`);

  const { text } = await generateText({
    model,
    prompt: `${prompt}

Write the scenario as a transaction event summary — 3-5 sentences describing the transaction details, sender/receiver context, and any flags raised by monitoring systems. Include dollar amounts, entity names, and jurisdictions where relevant. Output ONLY the transaction summary, nothing else.`,
    maxTokens: 400,
  });

  if (!text || text.trim().length < 10) {
    const retry = await generateText({
      model,
      prompt: `${prompt}\n\nWrite a realistic 3-5 sentence transaction event summary. Output ONLY the summary.`,
      maxTokens: 400,
    });
    if (!retry.text || retry.text.trim().length < 10) {
      throw new Error("Failed to generate scenario after retry");
    }
    return retry.text.trim();
  }

  return text.trim();
}
