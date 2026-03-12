import { newId, nowIso } from "@consensus-tools/core";
import type {
  WebhookHandlerContext,
  HandlerResult,
} from "./webhook-utils.js";
import {
  mapGitHubEventToSource,
  mapLinearEventToSource,
  matchAndRunWorkflows,
  tryChatWorkflowTrigger,
  extractRunIdFromText,
  stripRunIdFromText,
  findRunIdFromPending,
  verifyHmacSignature,
} from "./webhook-utils.js";
import { processHumanApproval } from "./chat-approval.js";
import crypto from "node:crypto";

// ── 1. GitHub Webhook ─────────────────────────────────────────────

export async function handleGitHubWebhook(
  ctx: WebhookHandlerContext,
  rawBody: Buffer,
  headers: Record<string, string | undefined>,
): Promise<HandlerResult> {
  const event = headers["x-github-event"] ?? "";
  const signature = headers["x-hub-signature-256"] ?? "";

  // Verify signature if secret is configured
  if (ctx.credentialManager) {
    const secret = ctx.credentialManager.get("github", "webhook_secret");
    if (secret) {
      if (!signature || !verifyHmacSignature(rawBody, signature, secret)) {
        return { status: 401, body: { error: "Invalid signature" } };
      }
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const action = payload["action"] as string | undefined;
  const source = mapGitHubEventToSource(event, action);
  if (!source) {
    // Log and return ok — unhandled event types are not errors
    await ctx.storage.update((state) => {
      state.audit.push({
        id: newId("audit"),
        at: nowIso(),
        type: "WEBHOOK_GITHUB",
        details: { event, action, source: null },
      });
    });
    return { status: 200, body: { ok: true, event, source: null, matched: [] } };
  }

  // Build trigger payload with PR metadata
  const pr = payload["pull_request"] as Record<string, unknown> | undefined;
  const head = pr?.["head"] as Record<string, unknown> | undefined;
  const base = pr?.["base"] as Record<string, unknown> | undefined;
  const user = pr?.["user"] as Record<string, unknown> | undefined;
  const repo = (payload["repository"] as Record<string, unknown> | undefined)?.["full_name"] as string | undefined;

  const triggerPayload: Record<string, unknown> = {
    ok: true,
    trigger: source,
    event,
    action,
    repo,
    ...(pr
      ? {
          prNumber: pr["number"],
          title: pr["title"],
          author: user?.["login"],
          headBranch: head?.["ref"],
          baseBranch: base?.["ref"],
          sha: head?.["sha"],
          diffUrl: pr["diff_url"],
          htmlUrl: pr["html_url"],
          additions: pr["additions"],
          deletions: pr["deletions"],
          changedFiles: pr["changed_files"],
        }
      : {}),
  };

  const matched = await matchAndRunWorkflows(ctx, source, triggerPayload, {
    repo,
    branch: base?.["ref"] as string | undefined,
  });

  await ctx.storage.update((state) => {
    state.audit.push({
      id: newId("audit"),
      at: nowIso(),
      type: "WEBHOOK_GITHUB",
      details: { event, action, source, matchedCount: matched.length },
    });
  });

  return { status: 200, body: { ok: true, event, source, matched } };
}

// ── 2. Linear Webhook ─────────────────────────────────────────────

export async function handleLinearWebhook(
  ctx: WebhookHandlerContext,
  rawBody: Buffer,
  headers: Record<string, string | undefined>,
): Promise<HandlerResult> {
  const signature = headers["linear-signature"] ?? "";

  // Verify signature if secret is configured
  if (ctx.credentialManager) {
    const secret = ctx.credentialManager.get("linear", "webhook_secret");
    if (secret) {
      if (!signature) return { status: 401, body: { error: "Missing signature" } };
      const expected = (await import("node:crypto")).createHmac("sha256", secret).update(rawBody).digest("hex");
      if (expected.length !== signature.length ||
          !(await import("node:crypto")).timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
        return { status: 401, body: { error: "Invalid signature" } };
      }
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const action = payload["action"] as string ?? "";
  const type = payload["type"] as string ?? "";
  const source = mapLinearEventToSource(action, type);

  if (!source) {
    return { status: 200, body: { ok: true, event: `${type}:${action}`, source: null, matched: [] } };
  }

  // Build trigger payload with task metadata
  const data = payload["data"] as Record<string, unknown> | undefined;
  const assignee = data?.["assignee"] as Record<string, unknown> | undefined;
  const team = data?.["team"] as Record<string, unknown> | undefined;

  const triggerPayload: Record<string, unknown> = {
    ok: true,
    trigger: source,
    event: `${type}:${action}`,
    taskId: data?.["id"],
    title: data?.["title"],
    description: data?.["description"],
    state: (data?.["state"] as Record<string, unknown>)?.["name"],
    priority: data?.["priority"],
    assigneeId: assignee?.["id"],
    assigneeName: assignee?.["name"],
    teamId: team?.["id"],
    teamName: team?.["name"],
    labels: (data?.["labels"] as Array<Record<string, unknown>>)?.map((l) => l["name"]),
    url: data?.["url"],
  };

  const matched = await matchAndRunWorkflows(ctx, source, triggerPayload, {
    team: team?.["key"] as string | undefined,
  });

  await ctx.storage.update((state) => {
    state.audit.push({
      id: newId("audit"),
      at: nowIso(),
      type: "WEBHOOK_LINEAR",
      details: { event: `${type}:${action}`, source, matchedCount: matched.length },
    });
  });

  return { status: 200, body: { ok: true, event: `${type}:${action}`, source, matched } };
}

// ── Chat webhook shared helper ────────────────────────────────────

async function handleChatMessage(
  ctx: WebhookHandlerContext,
  adapter: string,
  text: string,
  userId: string,
  channel?: string,
  metadataRunId?: string,
): Promise<HandlerResult> {
  // Fire-and-forget chat workflow trigger
  tryChatWorkflowTrigger(ctx, adapter, text, userId, channel).catch(() => {});

  // Extract runId for HITL approval
  let runId = extractRunIdFromText(text);
  let replyText = runId ? stripRunIdFromText(text) : text;

  if (!runId && metadataRunId) {
    runId = metadataRunId;
  }

  if (!runId && ctx.hitlTracker) {
    runId = await findRunIdFromPending(ctx.hitlTracker, userId, adapter);
  }

  if (!runId) {
    return { status: 200, body: { ok: true, noRunId: true } };
  }

  // If stripping the runId leaves nothing, use the full text as the reply
  if (!replyText) replyText = text;

  const result = await processHumanApproval(ctx, runId, replyText, `${adapter}:${userId}`);
  return { status: result.ok ? 200 : 400, body: result };
}

// ── 3. Slack Events Webhook ───────────────────────────────────────

export async function handleSlackWebhook(
  ctx: WebhookHandlerContext,
  body: Record<string, unknown>,
  headers?: Record<string, string | undefined>,
  rawBody?: Buffer,
): Promise<HandlerResult> {
  // Verify Slack request signature if signing secret is configured
  if (ctx.credentialManager && headers && rawBody) {
    const signingSecret = ctx.credentialManager.get("slack", "signing_secret");
    if (signingSecret) {
      const timestamp = headers["x-slack-request-timestamp"] ?? "";
      const slackSig = headers["x-slack-signature"] ?? "";
      const baseString = `v0:${timestamp}:${rawBody.toString("utf8")}`;
      const expected = "v0=" + crypto.createHmac("sha256", signingSecret).update(baseString).digest("hex");
      if (!slackSig || slackSig !== expected) {
        return { status: 401, body: { error: "Invalid Slack signature" } };
      }
    }
  }

  // URL verification challenge
  if (body["type"] === "url_verification") {
    return { status: 200, body: { challenge: body["challenge"] } };
  }

  if (body["type"] !== "event_callback") {
    return { status: 200, body: { ok: true } };
  }

  const event = body["event"] as Record<string, unknown> | undefined;
  if (!event || event["type"] !== "message") {
    return { status: 200, body: { ok: true } };
  }

  // Skip bot messages and subtypes
  if (event["bot_id"] || event["subtype"]) {
    return { status: 200, body: { ok: true } };
  }

  const text = (event["text"] as string) ?? "";
  const userId = (event["user"] as string) ?? "";
  const channel = (event["channel"] as string) ?? "";

  // Check for runId in event metadata
  const metadata = body["event_metadata"] as Record<string, unknown> | undefined;
  const eventPayload = metadata?.["event_payload"] as Record<string, unknown> | undefined;
  const metadataRunId = eventPayload?.["runId"] as string | undefined;

  return handleChatMessage(ctx, "slack", text, userId, channel, metadataRunId);
}

// ── 4. Teams Activity Webhook ─────────────────────────────────────

export async function handleTeamsWebhook(
  ctx: WebhookHandlerContext,
  body: Record<string, unknown>,
  headers?: Record<string, string | undefined>,
): Promise<HandlerResult> {
  // Verify Teams HMAC if security token is configured
  if (ctx.credentialManager && headers) {
    const securityToken = ctx.credentialManager.get("teams", "security_token");
    if (securityToken) {
      const authHeader = headers["authorization"] ?? "";
      const hmacValue = headers["x-hmac"] ?? "";
      if (!authHeader && !hmacValue) {
        return { status: 401, body: { error: "Missing Teams authorization" } };
      }
    }
  }

  if (body["type"] !== "message") {
    return { status: 200, body: { ok: true } };
  }

  let text = (body["text"] as string) ?? "";
  // Strip Teams @mention tags
  text = text.replace(/<at>.*?<\/at>/g, "").trim();

  const from = body["from"] as Record<string, unknown> | undefined;
  const userId = (from?.["id"] as string) ?? "";

  const channelData = body["channelData"] as Record<string, unknown> | undefined;
  const consensusData = channelData?.["consensus"] as Record<string, unknown> | undefined;
  const metadataRunId = consensusData?.["runId"] as string | undefined;

  return handleChatMessage(ctx, "teams", text, userId, undefined, metadataRunId);
}

// ── 5. Discord Interactions Webhook ───────────────────────────────

export async function handleDiscordWebhook(
  ctx: WebhookHandlerContext,
  body: Record<string, unknown>,
  headers?: Record<string, string | undefined>,
  rawBody?: Buffer,
): Promise<HandlerResult> {
  // Verify Discord Ed25519 signature if public key is configured
  if (ctx.credentialManager && headers && rawBody) {
    const publicKey = ctx.credentialManager.get("discord", "public_key");
    if (publicKey) {
      const signature = headers["x-signature-ed25519"] ?? "";
      const timestamp = headers["x-signature-timestamp"] ?? "";
      try {
        const message = Buffer.concat([Buffer.from(timestamp), rawBody]);
        const isValid = crypto.verify(
          null,
          message,
          { key: Buffer.from(publicKey, "hex"), format: "der", type: "spki" },
          Buffer.from(signature, "hex"),
        );
        if (!isValid) return { status: 401, body: { error: "Invalid Discord signature" } };
      } catch {
        // Ed25519 verification failed — reject
        return { status: 401, body: { error: "Invalid Discord signature" } };
      }
    }
  }

  // Discord ping verification
  if (body["type"] === 1) {
    return { status: 200, body: { type: 1 } };
  }

  const data = body["data"] as Record<string, unknown> | undefined;
  const options = data?.["options"] as Array<Record<string, unknown>> | undefined;
  const text = (options?.[0]?.["value"] as string) ?? (body["content"] as string) ?? "";

  const member = body["member"] as Record<string, unknown> | undefined;
  const user = member?.["user"] as Record<string, unknown> | undefined;
  const userId = (user?.["id"] as string) ?? "";

  return handleChatMessage(ctx, "discord", text, userId);
}

// ── 6. Telegram Webhook ───────────────────────────────────────────

export async function handleTelegramWebhook(
  ctx: WebhookHandlerContext,
  body: Record<string, unknown>,
  headers?: Record<string, string | undefined>,
): Promise<HandlerResult> {
  // Verify Telegram secret_token if configured
  if (ctx.credentialManager && headers) {
    const secretToken = ctx.credentialManager.get("telegram", "secret_token");
    if (secretToken) {
      const provided = headers["x-telegram-bot-api-secret-token"] ?? "";
      if (provided !== secretToken) {
        return { status: 401, body: { error: "Invalid Telegram secret token" } };
      }
    }
  }

  const message = (body["message"] ?? body["edited_message"]) as Record<string, unknown> | undefined;
  const text = (message?.["text"] as string) ?? "";

  if (!text) {
    return { status: 200, body: { ok: true } };
  }

  const from = message?.["from"] as Record<string, unknown> | undefined;
  const userId = String(from?.["id"] ?? "");

  return handleChatMessage(ctx, "telegram", text, userId);
}

// ── 7. Generic Chat Adapter Webhook ───────────────────────────────

export async function handleGenericChatWebhook(
  ctx: WebhookHandlerContext,
  adapter: string,
  body: Record<string, unknown>,
): Promise<HandlerResult> {
  const text = (body["text"] ?? body["replyText"]) as string | undefined;
  const userId = (body["approver"] as string) ?? "human";

  // Fire chat trigger if text present
  if (text) {
    tryChatWorkflowTrigger(ctx, adapter, text, userId).catch(() => {});
  }

  const runId = body["runId"] as string | undefined;
  const replyText = body["replyText"] as string | undefined;

  if (!runId || !replyText) {
    return { status: 200, body: { ok: true, noApproval: true } };
  }

  const approver = `${adapter}:${userId}`;
  const idempotencyKey = body["idempotencyKey"] as string | undefined;

  const result = await processHumanApproval(ctx, runId, replyText, approver, idempotencyKey);
  return { status: result.ok ? 200 : 400, body: result };
}
