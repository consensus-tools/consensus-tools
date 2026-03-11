import type { ChatTarget, DeliveryResult, CredentialProvider } from "../types.js";

export async function sendDiscordDM(
  target: ChatTarget,
  message: string,
  _meta: Record<string, unknown>,
  credentials: CredentialProvider,
): Promise<DeliveryResult> {
  const token = credentials.get("discord", "bot_token") || process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    return { target, delivered: false, provider: "discord", reason: "No Discord bot_token configured" };
  }
  try {
    const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bot ${token}` },
      body: JSON.stringify({ recipient_id: target.handle }),
    });
    const dmData = (await dmRes.json()) as Record<string, unknown>;
    if (!dmData["id"]) {
      return { target, delivered: false, provider: "discord", reason: "Failed to open DM channel" };
    }
    const r = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(dmData["id"] as string)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bot ${token}` },
      body: JSON.stringify({ content: message }),
    });
    const data = (await r.json()) as Record<string, unknown>;
    return {
      target,
      delivered: r.ok,
      provider: "discord",
      messageId: data["id"] as string | undefined,
      reason: r.ok ? undefined : ((data["message"] as string) || "Discord API error"),
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Discord DM failed";
    return { target, delivered: false, provider: "discord", reason: msg };
  }
}
