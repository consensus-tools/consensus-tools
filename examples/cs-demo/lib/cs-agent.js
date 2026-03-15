import { generateText } from "ai";

export async function getCSResponse(scenario, model) {
  const { text } = await generateText({
    model,
    system: `You are a customer service agent. Respond to the customer's message with a helpful, professional reply. Be thorough but concise. You may reference policies like refund windows, shipping timelines, or escalation procedures as appropriate. Write naturally — this is a real response that will be sent to the customer.`,
    prompt: scenario,
    maxTokens: 500,
  });

  if (!text || text.trim().length < 10) {
    const retry = await generateText({
      model,
      system: "You are a customer service agent. Write a helpful, professional reply to this customer message.",
      prompt: scenario,
      maxTokens: 500,
    });
    if (!retry.text || retry.text.trim().length < 10) {
      throw new Error("Failed to generate CS response after retry");
    }
    return retry.text.trim();
  }

  return text.trim();
}

export async function rewriteCSResponse(scenario, originalResponse, guardFeedback, model) {
  const feedbackLines = guardFeedback
    .map((v) => `${v.evaluator}: ${v.vote} (risk ${v.risk.toFixed(2)}) — "${v.reason}"`)
    .join("\n");

  const { text } = await generateText({
    model,
    system: `You are a customer service agent. Your previous response was flagged by the quality review team. Rewrite it to address their feedback while maintaining helpfulness. Do NOT make promises you cannot keep. Do NOT use legal language. Be careful about refund commitments.`,
    prompt: `Customer message:\n${scenario}\n\nYour original response:\n${originalResponse}\n\nReviewer feedback:\n${feedbackLines}\n\nWrite an improved response that addresses the feedback:`,
    maxTokens: 500,
  });

  return text?.trim() || originalResponse;
}
