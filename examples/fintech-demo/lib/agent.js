import { generateText } from "ai";

export async function getAgentResponse(scenario, model) {
  const { text } = await generateText({
    model,
    system: `You are a transaction decisioning agent in a payment processing pipeline. Your job is to evaluate transactions and return a structured verdict: APPROVE, FLAG, or HOLD. Include your reasoning — reference the transaction amount, sender/receiver risk profile, jurisdiction, velocity patterns, and any applicable compliance rules (BSA/AML, OFAC, KYC). Be thorough but concise. This verdict will be reviewed by governance guards before execution.`,
    prompt: scenario,
    maxTokens: 500,
  });

  if (!text || text.trim().length < 10) {
    const retry = await generateText({
      model,
      system: "You are a transaction decisioning agent. Evaluate this transaction and return a structured verdict with reasoning.",
      prompt: scenario,
      maxTokens: 500,
    });
    if (!retry.text || retry.text.trim().length < 10) {
      throw new Error("Failed to generate agent response after retry");
    }
    return retry.text.trim();
  }

  return text.trim();
}

export async function rewriteAgentResponse(scenario, originalResponse, guardFeedback, model) {
  const feedbackLines = guardFeedback
    .map((v) => `${v.evaluator}: ${v.vote} (risk ${v.risk.toFixed(2)}) — "${v.reason}"`)
    .join("\n");

  const { text } = await generateText({
    model,
    system: `You are a transaction decisioning agent. Your previous verdict was flagged by the governance review board. Revise your assessment to address their feedback. Be more conservative where compliance or fraud risk was identified. Do NOT approve transactions where guards raised AML or jurisdiction concerns. Escalate to human review if risk is ambiguous.`,
    prompt: `Transaction details:\n${scenario}\n\nYour original verdict:\n${originalResponse}\n\nGovernance board feedback:\n${feedbackLines}\n\nWrite a revised verdict that addresses the feedback:`,
    maxTokens: 500,
  });

  return text?.trim() || originalResponse;
}
