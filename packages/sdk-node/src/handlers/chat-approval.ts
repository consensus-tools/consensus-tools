import { parseHumanApprovalYesNo } from "@consensus-tools/schemas";
import { newId, nowIso } from "@consensus-tools/core";
import type { WebhookHandlerContext, HandlerResult } from "./webhook-utils.js";

// Idempotency is now checked against the persistent audit trail (see processHumanApproval)

export interface ApprovalResult {
  ok: boolean;
  decision?: string;
  runId: string;
  complete: boolean;
  votesReceived?: number;
  votesRequired?: number;
  error?: string;
}

/**
 * Shared approval processing logic used by all chat webhooks and the explicit
 * human-approval-reply endpoint. Matches legacy humanApprovePost() behavior.
 */
export async function processHumanApproval(
  ctx: WebhookHandlerContext,
  runId: string,
  replyText: string,
  approver: string = "human",
  idempotencyKey?: string,
): Promise<ApprovalResult> {
  if (!ctx.hitlTracker) {
    return { ok: false, runId, complete: false, error: "HITL tracker not configured" };
  }

  // Idempotency check — look for existing audit event with this key
  if (idempotencyKey) {
    const state = await ctx.storage.getState();
    const exists = state.audit.some((e) =>
      (e.type === "VOTE_RECEIVED" || e.type === "FINAL_DECISION")
      && (e.details as Record<string, unknown>)?.idempotencyKey === idempotencyKey
      && (e.details as Record<string, unknown>)?.runId === runId,
    );
    if (exists) {
      return { ok: true, runId, complete: true, decision: "DUPLICATE" };
    }
  }

  // Parse decision
  let decision: "YES" | "NO" | "REWRITE";
  try {
    decision = parseHumanApprovalYesNo(replyText);
  } catch {
    return { ok: false, runId, complete: false, error: "Invalid decision — expected YES, NO, or REWRITE" };
  }

  // Record vote
  const voteResult = await ctx.hitlTracker.recordVoteReceived(runId);

  // Audit the vote
  await ctx.storage.update((state) => {
    state.audit.push({
      id: newId("audit"),
      at: nowIso(),
      type: voteResult.complete ? "FINAL_DECISION" : "VOTE_RECEIVED",
      details: {
        runId,
        decision,
        approver,
        votesReceived: voteResult.total,
        votesRequired: voteResult.required,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
    });
  });

  if (!voteResult.complete) {
    return {
      ok: true,
      runId,
      decision,
      complete: false,
      votesReceived: voteResult.total,
      votesRequired: voteResult.required,
    };
  }

  return {
    ok: true,
    runId,
    decision,
    complete: true,
    votesReceived: voteResult.total,
    votesRequired: voteResult.required,
  };
}

/**
 * POST /api/chat/human-approval-reply
 */
export async function handleChatApprovalReply(
  ctx: WebhookHandlerContext,
  body: Record<string, unknown>,
): Promise<HandlerResult> {
  const runId = body["runId"] as string | undefined;
  const replyText = body["replyText"] as string | undefined;
  if (!runId || !replyText) {
    return { status: 400, body: { error: "Missing required fields: runId, replyText" } };
  }
  const approver = (body["approver"] as string) ?? "human";
  const idempotencyKey = body["idempotencyKey"] as string | undefined;

  const result = await processHumanApproval(ctx, runId, replyText, approver, idempotencyKey);
  return { status: result.ok ? 200 : 400, body: result };
}

/**
 * POST /api/workflow-runs/:runId/approve
 */
export async function handleWorkflowRunApprove(
  ctx: WebhookHandlerContext,
  runId: string,
  body: Record<string, unknown>,
): Promise<HandlerResult> {
  if (!ctx.workflowRunner) {
    return { status: 501, body: { error: "Workflow runner not configured" } };
  }

  const decision = body["decision"] as string | undefined;
  if (!decision || !["YES", "NO", "REWRITE"].includes(decision)) {
    return { status: 400, body: { error: "Invalid decision — expected YES, NO, or REWRITE" } };
  }
  const approver = (body["approver"] as string) ?? "human";

  // Find the workflow run to get the workflowId
  const state = await ctx.storage.getState();
  const run = state.workflowRuns.find((r) => r.runId === runId);
  if (!run) return { status: 404, body: { error: "Workflow run not found" } };

  // Resolve the HITL approval if tracked
  if (ctx.hitlTracker) {
    await ctx.hitlTracker.resolveApproval(runId);
  }

  try {
    const result = await ctx.workflowRunner.resume(run.workflowId, runId, decision, approver);
    return {
      status: 200,
      body: {
        ok: true,
        workflowId: run.workflowId,
        runId,
        status: result.status,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: 500, body: { error: msg } };
  }
}
