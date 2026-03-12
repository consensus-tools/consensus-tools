import type { WebhookHandlerContext, HandlerResult } from "./webhook-utils.js";

const VALID_ADAPTERS: Record<string, string | null> = {
  slack: "@slack/web-api",
  teams: "botbuilder",
  discord: "discord.js",
  telegram: "node-telegram-bot-api",
  gchat: null,
  webhook: null,
};

export function handleListAdapters(ctx: WebhookHandlerContext): HandlerResult {
  if (!ctx.credentialManager) {
    return { status: 501, body: { error: "Credential manager not configured" } };
  }

  const adapters: Record<string, boolean> = {};
  for (const id of Object.keys(VALID_ADAPTERS)) {
    const cred = ctx.credentialManager.get("adapter", id);
    adapters[id] = cred === "installed";
  }

  return { status: 200, body: { adapters } };
}

export function handleInstallAdapter(
  ctx: WebhookHandlerContext,
  body: Record<string, unknown>,
): HandlerResult {
  if (!ctx.credentialManager) {
    return { status: 501, body: { error: "Credential manager not configured" } };
  }

  const adapter = body.adapter as string | undefined;
  if (!adapter || !(adapter in VALID_ADAPTERS)) {
    return {
      status: 400,
      body: { error: `Unknown adapter: ${adapter}. Valid: ${Object.keys(VALID_ADAPTERS).join(", ")}` },
    };
  }

  // In the monorepo context, we mark as installed via credential store
  // (no npm install — packages are workspace deps)
  ctx.credentialManager.upsert("adapter", adapter, "installed");

  return {
    status: 200,
    body: {
      ok: true,
      adapter,
      package: VALID_ADAPTERS[adapter],
      installed: true,
    },
  };
}

export function handleUninstallAdapter(
  ctx: WebhookHandlerContext,
  body: Record<string, unknown>,
): HandlerResult {
  if (!ctx.credentialManager) {
    return { status: 501, body: { error: "Credential manager not configured" } };
  }

  const adapter = body.adapter as string | undefined;
  if (!adapter || !(adapter in VALID_ADAPTERS)) {
    return { status: 400, body: { error: `Unknown adapter: ${adapter}` } };
  }

  // Remove adapter credential and associated keys
  ctx.credentialManager.delete("adapter", adapter);
  ctx.credentialManager.delete(adapter, "bot_token");
  ctx.credentialManager.delete(adapter, "webhook_url");
  ctx.credentialManager.delete(adapter, "api_key");

  return { status: 200, body: { ok: true, adapter, uninstalled: true } };
}
