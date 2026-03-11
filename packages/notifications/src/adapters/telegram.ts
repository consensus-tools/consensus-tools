import type { ChatTarget, DeliveryResult, CredentialProvider } from "../types.js";

export async function sendTelegramDM(
  target: ChatTarget,
  message: string,
  _meta: Record<string, unknown>,
  credentials: CredentialProvider,
): Promise<DeliveryResult> {
  const token = credentials.get("telegram", "bot_token") || process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    return { target, delivered: false, provider: "telegram", reason: "No Telegram bot_token configured" };
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: target.handle, text: message, parse_mode: "Markdown" }),
    });
    const data = (await r.json()) as Record<string, unknown>;
    const result = data["result"] as Record<string, unknown> | undefined;
    return {
      target,
      delivered: data["ok"] === true,
      provider: "telegram",
      messageId: String(result?.["message_id"] || ""),
      reason: data["ok"] ? undefined : ((data["description"] as string) || "Telegram API error"),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Telegram DM failed";
    return { target, delivered: false, provider: "telegram", reason: msg };
  }
}
