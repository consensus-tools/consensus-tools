import type { ChatTarget, ChatPrompt, PromptResult, CredentialProvider, DeliveryResult } from "./types.js";
import { sendSlackDM } from "./adapters/slack.js";
import { sendTeamsDM } from "./adapters/teams.js";
import { sendDiscordDM } from "./adapters/discord.js";
import { sendTelegramDM } from "./adapters/telegram.js";
import { sendViaWebhook } from "./adapters/webhook.js";

export function formatMention(adapter: string, handle: string): string {
  switch (adapter) {
    case "slack":
      return handle.startsWith("U") ? `<@${handle}>` : `@${handle}`;
    case "teams":
      return `<at>${handle}</at>`;
    case "discord":
      return /^\d+$/.test(handle) ? `<@${handle}>` : `@${handle}`;
    case "telegram":
      return handle.startsWith("@") ? handle : `@${handle}`;
    case "gchat":
      return `<users/${handle}>`;
    default:
      return `@${handle}`;
  }
}

function buildApprovalMessage(prompt: ChatPrompt, targets: ChatTarget[]): string {
  const mode = prompt.promptMode || "yes-no";
  const riskPct = (prompt.risk * 100).toFixed(0);
  const threshPct = (prompt.threshold * 100).toFixed(0);

  const mentions = targets.map((t) => formatMention(t.adapter, t.handle)).join(", ");
  const mentionLine = mentions ? `${mentions} — ` : "";

  let actionHint: string;
  if (mode === "approve-reject-revise") {
    actionHint = "Reply APPROVE, REJECT, or REVISE.";
  } else if (mode === "acknowledge") {
    actionHint = "Reply ACK to acknowledge.";
  } else if (mode === "vote") {
    actionHint = `Reply YES, NO, or REWRITE with your rationale. (${prompt.requiredVotes ?? 1} vote(s) required)`;
  } else {
    actionHint = "Reply YES or NO.";
  }

  const timeoutLine = prompt.timeoutSec ? `\nDeadline: ${Math.ceil(prompt.timeoutSec / 60)} minutes` : "";

  return (
    `${mentionLine}Guard approval required for run ${prompt.runId}\n` +
    `Risk: ${riskPct}% (threshold: ${threshPct}%) | Quorum: ${(prompt.quorum * 100).toFixed(0)}%\n` +
    `${actionHint}${timeoutLine}`
  );
}

async function sendViaAdapter(
  target: ChatTarget,
  message: string,
  meta: Record<string, unknown>,
  credentials: CredentialProvider,
): Promise<DeliveryResult> {
  switch (target.adapter) {
    case "slack":
      return sendSlackDM(target, message, meta, credentials);
    case "teams":
      return sendTeamsDM(target, message, meta, credentials);
    case "discord":
      return sendDiscordDM(target, message, meta, credentials);
    case "telegram":
      return sendTelegramDM(target, message, meta, credentials);
    default:
      return { target, delivered: false, provider: target.adapter, reason: `Unknown adapter: ${target.adapter}` };
  }
}

export async function sendHumanApprovalPrompt(
  prompt: ChatPrompt,
  credentials: CredentialProvider,
  chatProvider: string = process.env["CHAT_PROVIDER"] ?? "webhook",
): Promise<PromptResult> {
  const mode = prompt.promptMode || "yes-no";
  const targets = prompt.chatTargets || [];
  const message = buildApprovalMessage(prompt, targets);

  const meta: Record<string, unknown> = {
    boardId: prompt.boardId,
    runId: prompt.runId,
    approverHint: prompt.approverHint ?? "human",
    type: "human_approval_request",
    promptMode: mode,
    timeoutSec: prompt.timeoutSec,
    requiredVotes: prompt.requiredVotes,
  };

  if (chatProvider === "stdout") {
    const targetInfo =
      targets.length > 0 ? targets.map((t) => `${t.subjectId} via ${t.adapter}:${t.handle}`).join(", ") : "broadcast";
    console.log("[chat-sdk]", message, `[targets: ${targetInfo}]`);
    return {
      delivered: true,
      provider: "stdout",
      message,
      promptMode: mode,
      results: targets.map((t) => ({ target: t, delivered: true, provider: "stdout" })),
    };
  }

  if (targets.length > 0) {
    const results = await Promise.all(
      targets.map((target) => sendViaAdapter(target, message, { ...meta, targetSubjectId: target.subjectId }, credentials)),
    );
    const anyDelivered = results.some((r) => r.delivered);

    if (!anyDelivered) {
      const fallback = await sendViaWebhook(message, meta, credentials);
      return {
        delivered: fallback.delivered,
        provider: "webhook-fallback",
        message,
        promptMode: mode,
        results: [...results, fallback],
        broadcastFallback: true,
      };
    }
    return { delivered: anyDelivered, provider: "multi-adapter", message, promptMode: mode, results };
  }

  const fallback = await sendViaWebhook(message, meta, credentials);
  return { delivered: fallback.delivered, provider: "webhook", message, promptMode: mode, results: [fallback], broadcastFallback: true };
}

export async function sendTimeoutWarning(
  prompt: ChatPrompt,
  remainingSec: number,
  credentials: CredentialProvider,
  chatProvider: string = process.env["CHAT_PROVIDER"] ?? "webhook",
): Promise<PromptResult> {
  const targets = prompt.chatTargets || [];
  const mentions = targets.map((t) => formatMention(t.adapter, t.handle)).join(", ");
  const mentionLine = mentions ? `${mentions} ` : "";
  const message = `${mentionLine}Reminder: approval for run ${prompt.runId} is still pending. ${Math.ceil(remainingSec / 60)} minute(s) remaining before auto-escalation.`;

  const meta: Record<string, unknown> = {
    boardId: prompt.boardId,
    runId: prompt.runId,
    type: "approval_timeout_warning",
    remainingSec,
  };

  if (chatProvider === "stdout") {
    console.log("[chat-sdk] TIMEOUT WARNING:", message);
    return { delivered: true, provider: "stdout", message, promptMode: "warning", results: [] };
  }
  if (targets.length > 0) {
    const results = await Promise.all(targets.map((t) => sendViaAdapter(t, message, meta, credentials)));
    return { delivered: results.some((r) => r.delivered), provider: "multi-adapter", message, promptMode: "warning", results };
  }
  const fallback = await sendViaWebhook(message, meta, credentials);
  return { delivered: fallback.delivered, provider: "webhook", message, promptMode: "warning", results: [fallback] };
}

export async function sendDeadlineExpired(
  prompt: ChatPrompt,
  autoDecision: string,
  credentials: CredentialProvider,
  chatProvider: string = process.env["CHAT_PROVIDER"] ?? "webhook",
): Promise<PromptResult> {
  const targets = prompt.chatTargets || [];
  const mentions = targets.map((t) => formatMention(t.adapter, t.handle)).join(", ");
  const mentionLine = mentions ? `${mentions} ` : "";
  const message = `${mentionLine}Deadline expired for run ${prompt.runId}. Auto-resolved as: ${autoDecision}.`;

  const meta: Record<string, unknown> = {
    boardId: prompt.boardId,
    runId: prompt.runId,
    type: "approval_deadline_expired",
    autoDecision,
  };

  if (chatProvider === "stdout") {
    console.log("[chat-sdk] DEADLINE EXPIRED:", message);
    return { delivered: true, provider: "stdout", message, promptMode: "expired", results: [] };
  }
  if (targets.length > 0) {
    const results = await Promise.all(targets.map((t) => sendViaAdapter(t, message, meta, credentials)));
    return { delivered: results.some((r) => r.delivered), provider: "multi-adapter", message, promptMode: "expired", results };
  }
  const fallback = await sendViaWebhook(message, meta, credentials);
  return { delivered: fallback.delivered, provider: "webhook", message, promptMode: "expired", results: [fallback] };
}
