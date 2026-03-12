import type { WebhookHandlerContext, HandlerResult } from "./webhook-utils.js";

export function handleListCredentials(ctx: WebhookHandlerContext): HandlerResult {
  if (!ctx.credentialManager) return { status: 501, body: { error: "Credential manager not configured" } };
  return { status: 200, body: { credentials: ctx.credentialManager.list() } };
}

export function handleUpsertCredential(
  ctx: WebhookHandlerContext,
  body: Record<string, unknown>,
): HandlerResult {
  if (!ctx.credentialManager) return { status: 501, body: { error: "Credential manager not configured" } };
  const provider = body["provider"] as string | undefined;
  const keyName = body["keyName"] as string | undefined;
  const value = body["value"] as string | undefined;
  if (!provider || !keyName || !value) {
    return { status: 400, body: { error: "Missing required fields: provider, keyName, value" } };
  }
  const result = ctx.credentialManager.upsert(provider, keyName, value);
  return { status: 200, body: result };
}

export function handleDeleteCredential(
  ctx: WebhookHandlerContext,
  provider: string,
  keyName: string,
): HandlerResult {
  if (!ctx.credentialManager) return { status: 501, body: { error: "Credential manager not configured" } };
  const deleted = ctx.credentialManager.delete(provider, keyName);
  if (!deleted) return { status: 404, body: { error: "Credential not found" } };
  return { status: 200, body: { ok: true } };
}

export function handleProviderStatus(
  ctx: WebhookHandlerContext,
  provider: string,
): HandlerResult {
  if (!ctx.credentialManager) return { status: 501, body: { error: "Credential manager not configured" } };
  return { status: 200, body: ctx.credentialManager.getProviderStatus(provider) };
}
