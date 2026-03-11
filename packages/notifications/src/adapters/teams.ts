import type { ChatTarget, DeliveryResult, CredentialProvider } from "../types.js";

export async function sendTeamsDM(
  target: ChatTarget,
  message: string,
  meta: Record<string, unknown>,
  credentials: CredentialProvider,
): Promise<DeliveryResult> {
  const webhookUrl = credentials.get("teams", "webhook_url") || process.env["TEAMS_WEBHOOK_URL"];
  if (!webhookUrl) {
    return { target, delivered: false, provider: "teams", reason: "No Teams webhook_url configured" };
  }
  try {
    const r = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "message",
        text: message,
        mentions: [{ text: `<at>${target.handle}</at>`, mentioned: { id: target.handle, name: target.subjectId } }],
        consensus: meta,
      }),
    });
    return { target, delivered: r.ok, provider: "teams", reason: r.ok ? undefined : `Teams API ${r.status}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Teams DM failed";
    return { target, delivered: false, provider: "teams", reason: msg };
  }
}
