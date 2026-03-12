import type { Workflow, WorkflowRun, HitlApproval } from "@consensus-tools/schemas";
import type { IStorage, HitlTracker } from "@consensus-tools/core";
import type { CredentialProvider } from "@consensus-tools/notifications";
import type { CredentialManager } from "@consensus-tools/secrets";
import type { WorkflowRunner } from "../server.js";

export interface WebhookHandlerContext {
  storage: IStorage;
  hitlTracker?: HitlTracker;
  workflowRunner?: WorkflowRunner;
  credentialManager?: CredentialManager;
  logger?: { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void };
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

// ── Event-to-source mappers ───────────────────────────────────────

export function mapGitHubEventToSource(event: string, action?: string): string | null {
  if (event === "pull_request") {
    switch (action) {
      case "opened": return "github.pr.opened";
      case "synchronize": return "github.pr.updated";
      case "review_requested": return "github.pr.review_requested";
      case "closed": return "github.pr.closed";
      default: return null;
    }
  }
  if (event === "push") return "github.commit";
  if (event === "issues") {
    if (action === "opened") return "github.issue.opened";
    if (action === "closed") return "github.issue.closed";
    return null;
  }
  if (event === "issue_comment" && action === "created") return "github.comment.created";
  return null;
}

export function mapLinearEventToSource(action: string, type: string): string | null {
  if (type === "Issue" && action === "create") return "linear.task.created";
  if (type === "Issue" && action === "update") return "linear.task.updated";
  if (type === "Comment" && action === "create") return "linear.webhook";
  if (type === "Project" && action === "update") return "linear.webhook";
  return null;
}

// ── Workflow trigger matching ─────────────────────────────────────

interface TriggerFilters {
  repo?: string;
  branch?: string;
  team?: string;
  channel?: string;
  matchText?: string;
  fromUsers?: string;
}

export async function matchAndRunWorkflows(
  ctx: WebhookHandlerContext,
  source: string,
  triggerPayload: Record<string, unknown>,
  filters?: TriggerFilters,
): Promise<Array<{ workflowId: string; runId?: string }>> {
  if (!ctx.workflowRunner) return [];

  const workflows = await ctx.workflowRunner.listWorkflows();
  const matched: Array<{ workflowId: string; runId?: string }> = [];

  for (const wf of workflows) {
    const def = wf.definition as Record<string, unknown> | undefined;
    if (!def) continue;

    // Find trigger node — first node with type "trigger", or nodes[0]
    const nodes = (def["nodes"] ?? def["steps"]) as Array<Record<string, unknown>> | undefined;
    if (!nodes || nodes.length === 0) continue;
    const trigger = nodes.find((n) => n["type"] === "trigger") ?? nodes[0];
    if (!trigger) continue;

    const config = trigger["config"] as Record<string, unknown> | undefined;
    if (!config) continue;

    const triggerSource = config["source"] as string | undefined;
    if (!triggerSource) continue;

    // Match source — exact or wildcard (e.g. "chat.*")
    if (triggerSource !== source) {
      if (triggerSource.endsWith(".*")) {
        const prefix = triggerSource.slice(0, -1);
        if (!source.startsWith(prefix)) continue;
      } else {
        continue;
      }
    }

    // Apply filters
    if (filters?.repo && config["repo"] && config["repo"] !== filters.repo) continue;
    if (filters?.branch && config["branch"] && config["branch"] !== filters.branch) continue;
    if (filters?.team && config["team"] && config["team"] !== filters.team) continue;
    if (filters?.channel && config["channel"] && config["channel"] !== filters.channel) continue;
    if (filters?.matchText && config["matchText"]) {
      const match = config["matchText"] as string;
      if (!filters.matchText.toLowerCase().includes(match.toLowerCase())) continue;
    }
    if (filters?.fromUsers && config["fromUsers"]) {
      const allowed = (config["fromUsers"] as string).split(",").map((s) => s.trim());
      if (!allowed.includes(filters.fromUsers)) continue;
    }

    try {
      const run = await ctx.workflowRunner.run(wf.id, {
        context: { __triggerPayload: triggerPayload },
      });
      matched.push({ workflowId: wf.id, runId: run.runId });
    } catch (e) {
      ctx.logger?.warn?.(`Failed to run workflow ${wf.id}: ${e}`);
      matched.push({ workflowId: wf.id });
    }
  }

  return matched;
}

// ── Chat workflow trigger ─────────────────────────────────────────

export async function tryChatWorkflowTrigger(
  ctx: WebhookHandlerContext,
  adapter: string,
  text: string,
  userId: string,
  channel?: string,
): Promise<number> {
  let chatSource: string;
  if (text.startsWith("/")) {
    chatSource = "chat.command";
  } else if (/@\w+/.test(text)) {
    chatSource = "chat.mention";
  } else {
    chatSource = "chat.message";
  }

  const payload = {
    ok: true,
    trigger: chatSource,
    adapter,
    channel: channel ?? adapter,
    sender: userId,
    text,
  };

  const matched = await matchAndRunWorkflows(ctx, chatSource, payload, {
    channel,
    matchText: text,
    fromUsers: userId,
  });

  return matched.length;
}

// ── RunId extraction ──────────────────────────────────────────────

const RUN_ID_RE = /run[:\s_]+(\S+)/i;

export function extractRunIdFromText(text: string): string | null {
  const match = RUN_ID_RE.exec(text);
  return match ? match[1]! : null;
}

export function stripRunIdFromText(text: string): string {
  return text.replace(RUN_ID_RE, "").trim();
}

export async function findRunIdFromPending(
  hitlTracker: HitlTracker,
  userId: string,
  adapter?: string,
): Promise<string | null> {
  const pending = await hitlTracker.listPending();
  for (const approval of pending) {
    const meta = approval.metadata as Record<string, unknown> | undefined;
    if (!meta) continue;
    const targets = meta["chatTargets"] as Array<Record<string, unknown>> | undefined;
    if (!targets) continue;
    for (const t of targets) {
      if (t["handle"] === userId || t["subjectId"] === userId) return approval.runId;
      if (adapter && t["adapter"] === adapter && (t["handle"] === userId || t["subjectId"] === userId)) {
        return approval.runId;
      }
    }
  }
  // Fallback: return the most recent pending approval
  if (pending.length > 0) return pending[pending.length - 1]!.runId;
  return null;
}

// ── Credential bridge ─────────────────────────────────────────────

export function credentialProviderBridge(mgr: CredentialManager): CredentialProvider {
  return { get: (provider, keyName) => mgr.get(provider, keyName) };
}

// ── HMAC signature verification ───────────────────────────────────

import crypto from "node:crypto";

export function verifyHmacSignature(
  body: Buffer,
  signature: string,
  secret: string,
  prefix = "sha256=",
): boolean {
  const expected = prefix + crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
