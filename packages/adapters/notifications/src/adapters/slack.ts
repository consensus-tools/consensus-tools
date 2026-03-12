import type { ChatTarget, DeliveryResult, CredentialProvider } from "../types.js";

export async function sendSlackDM(
  target: ChatTarget,
  message: string,
  meta: Record<string, unknown>,
  credentials: CredentialProvider,
): Promise<DeliveryResult> {
  const token = credentials.get("slack", "bot_token") || process.env["SLACK_BOT_TOKEN"];
  if (!token) {
    return { target, delivered: false, provider: "slack", reason: "No Slack bot_token configured" };
  }
  try {
    const openRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ users: target.handle }),
    });
    const openData = (await openRes.json()) as Record<string, unknown>;
    const channel = openData["channel"] as Record<string, unknown> | undefined;
    const channelId = (channel?.["id"] as string) || target.handle;

    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        channel: channelId,
        text: message,
        metadata: {
          event_type: "consensus_approval",
          event_payload: { runId: meta["runId"], boardId: meta["boardId"] },
        },
      }),
    });
    const data = (await r.json()) as Record<string, unknown>;
    return {
      target,
      delivered: data["ok"] === true,
      provider: "slack",
      messageId: data["ts"] as string | undefined,
      reason: data["ok"] ? undefined : ((data["error"] as string) || "Slack API error"),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Slack DM failed";
    return { target, delivered: false, provider: "slack", reason: msg };
  }
}
