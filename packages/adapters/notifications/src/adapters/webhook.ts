import type { DeliveryResult, CredentialProvider } from "../types.js";

const broadcastTarget = { subjectId: "broadcast", adapter: "webhook", handle: "" } as const;

export async function sendViaWebhook(
  message: string,
  meta: Record<string, unknown>,
  credentials: CredentialProvider,
): Promise<DeliveryResult> {
  const url = credentials.get("slack", "webhook_url") || process.env["CHAT_WEBHOOK_URL"];
  if (!url) {
    return {
      target: broadcastTarget,
      delivered: false,
      provider: "webhook",
      reason: "No webhook URL configured (check Settings or CHAT_WEBHOOK_URL env var)",
    };
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const bearer = credentials.get("slack", "bot_token") || process.env["CHAT_WEBHOOK_BEARER"];
  if (bearer) headers["Authorization"] = `Bearer ${bearer}`;

  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ message, ...meta }) });
    return { target: broadcastTarget, delivered: r.ok, provider: "webhook", reason: r.ok ? undefined : `HTTP ${r.status}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Webhook failed";
    return { target: broadcastTarget, delivered: false, provider: "webhook", reason: msg };
  }
}
