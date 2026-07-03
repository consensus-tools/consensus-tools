import { randomUUID } from "node:crypto";
import { parseHumanApprovalYesNo, humanApprovalRequestSchema } from "@consensus-tools/schemas";
import type { McpContext } from "../context.js";

export const tools = [
  {
    name: "human.approve",
    description:
      "Submit a human approval decision (YES / NO / REWRITE) for a guard run that is waiting on HITL review.",
    inputSchema: {
      type: "object" as const,
      properties: {
        runId: { type: "string", description: "The run ID awaiting approval" },
        approver: { type: "string", description: "Identifier of the approver (default: 'human')" },
        replyText: {
          type: "string",
          description: "Approval reply: YES, NO, or REWRITE (also accepts approve/block/deny/reject/revise)",
        },
        idempotencyKey: {
          type: "string",
          description: "Unique key to prevent duplicate approvals",
        },
      },
      required: ["runId", "replyText", "idempotencyKey"],
    },
  },
];

const REPLY_AUDIT_TYPE = "HITL_APPROVAL_REPLY";

// Worst-of ordering for aggregating quorum votes: any NO vetoes, any REWRITE
// outranks YES. Without this, N-of-M approvals are last-writer-wins and an early
// human NO is silently overwritten by a later YES.
type HumanDecision = "YES" | "NO" | "REWRITE";
const DECISION_SEVERITY: Record<string, number> = { NO: 3, REWRITE: 2, YES: 1 };

function worstDecision(decisions: string[]): HumanDecision {
  return decisions.reduce<HumanDecision>((worst, d) =>
    (DECISION_SEVERITY[d] ?? 0) > (DECISION_SEVERITY[worst] ?? 0) ? (d as HumanDecision) : worst,
  "YES");
}

export async function handle(
  name: string,
  args: Record<string, unknown>,
  ctx: McpContext,
): Promise<{ content: [{ type: "text"; text: string }] } | { isError: true; content: [{ type: "text"; text: string }] }> {
  if (name !== "human.approve") {
    return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  }

  try {
    const parsed = humanApprovalRequestSchema.safeParse(args);
    if (!parsed.success) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Validation failed", details: parsed.error.issues }) }] };
    }
    const { runId, approver, replyText, idempotencyKey } = parsed.data;

    // Parse the human reply into a normalized decision (YES / NO / REWRITE).
    const decision = parseHumanApprovalYesNo(replyText);

    const priorState = await ctx.storage.getState();

    // When required votes are in, resume the paused workflow *with the decision*.
    // The node executor aborts the guarded action on any non-YES decision, so a NO
    // actually blocks — and the workflow proceeds instead of hanging forever in
    // "waiting". Mirrors the proven @consensus-tools/sdk-node approval path.
    // Returns whether resume ran and its status/error, so callers can retry a hang.
    const attemptResume = async (
      dec: string,
      appr: string,
    ): Promise<{ resumed: boolean; resumeStatus?: string }> => {
      if (!ctx.workflowRunner) return { resumed: false };
      const run = priorState.workflowRuns.find((r) => r.runId === runId);
      if (!run) return { resumed: false };
      try {
        const result = await ctx.workflowRunner.resume(run.workflowId, runId, dec, appr);
        return { resumed: true, resumeStatus: result.status };
      } catch (err: unknown) {
        return { resumed: false, resumeStatus: err instanceof Error ? err.message : String(err) };
      }
    };

    // Idempotency: a retry of the same (runId, idempotencyKey, approver) must not
    // double-count the vote. The approver is part of the key — a DIFFERENT approver
    // reusing another approver's key value is a new vote, not a replay, otherwise a
    // colliding client-chosen key silently swallows a real quorum vote. If the
    // original vote completed but its workflow resume failed, re-attempt the resume
    // so an approved run isn't wedged forever; otherwise return the original
    // outcome unchanged.
    const isReplayRow = (e: (typeof priorState.audit)[number]) =>
      e.type === REPLY_AUDIT_TYPE &&
      (e.details as Record<string, unknown>)?.runId === runId &&
      (e.details as Record<string, unknown>)?.idempotencyKey === idempotencyKey &&
      ((e.details as Record<string, unknown>)?.approver ?? "human") === approver;
    const replayed = priorState.audit.find(isReplayRow);
    if (replayed) {
      const d = replayed.details as Record<string, unknown>;
      if (d.complete === true && d.resumed === false) {
        const retry = await attemptResume(String(d.effectiveDecision ?? d.decision), String(d.approver ?? "human"));
        if (retry.resumed) {
          await ctx.storage.update((state) => {
            const row = state.audit.find(isReplayRow);
            if (row) (row.details as Record<string, unknown>).resumed = true;
          });
        }
        return { content: [{ type: "text", text: JSON.stringify({ runId, decision: d.decision, approver: d.approver, idempotencyKey, duplicate: true, complete: true, ...retry }) }] };
      }
      return { content: [{ type: "text", text: JSON.stringify({ runId, decision: d.decision, approver: d.approver, idempotencyKey, duplicate: true, complete: d.complete ?? false }) }] };
    }

    // Snapshot the pending approval BEFORE recording the vote: its startedAt scopes
    // which prior audit votes belong to THIS approval cycle (a runId can be
    // re-escalated after an earlier cycle resolved).
    const pendingApproval = await ctx.hitlTracker.getPendingApproval(runId);

    // Record the vote against the pending approval.
    const voteResult = await ctx.hitlTracker.recordVoteReceived(runId);

    // No pending approval matched this runId — report an error rather than a
    // misleading success (recordVoteReceived returns required:0 when nothing matched).
    if (voteResult.required === 0 && voteResult.total === 0) {
      return { isError: true, content: [{ type: "text", text: `No pending approval found for run: ${runId}` }] };
    }

    // On completion, the decision that resumes the workflow is the WORST of every
    // vote in this cycle, not the last one to arrive — an early NO is a standing
    // veto that a later YES cannot overwrite.
    let effectiveDecision = decision;
    if (voteResult.complete) {
      const cycleStart = pendingApproval?.startedAt ? Date.parse(pendingApproval.startedAt) : 0;
      const priorVotes = priorState.audit
        .filter((e) => {
          if (e.type !== REPLY_AUDIT_TYPE) return false;
          if ((e.details as Record<string, unknown>)?.runId !== runId) return false;
          const at = Date.parse(e.at);
          return Number.isNaN(at) || at >= cycleStart;
        })
        .map((e) => String((e.details as Record<string, unknown>).decision));
      effectiveDecision = worstDecision([...priorVotes, decision]);
    }

    const { resumed, resumeStatus } = voteResult.complete
      ? await attemptResume(effectiveDecision, approver)
      : { resumed: false, resumeStatus: undefined };

    // Persist the decision + idempotency key so a NO is distinguishable from a YES,
    // replays are detectable, and a failed resume can be retried. Storing the
    // decision is what makes the human veto durable rather than decorative.
    await ctx.storage.update((state) => {
      state.audit.push({
        id: `audit_${randomUUID()}`,
        at: new Date().toISOString(),
        type: REPLY_AUDIT_TYPE,
        details: {
          runId, decision, approver, idempotencyKey,
          complete: voteResult.complete, resumed,
          ...(voteResult.complete ? { effectiveDecision } : {}),
        },
      });
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            runId,
            decision,
            approver,
            idempotencyKey,
            votesReceived: voteResult.total,
            votesRequired: voteResult.required,
            complete: voteResult.complete,
            ...(voteResult.complete ? { effectiveDecision } : {}),
            resumed,
            resumeStatus,
          }),
        },
      ],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}
