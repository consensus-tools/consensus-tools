import { parseHumanApprovalYesNo } from "@consensus-tools/schemas";
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

export async function handle(
  name: string,
  args: Record<string, unknown>,
  ctx: McpContext,
): Promise<{ content: [{ type: "text"; text: string }] } | { isError: true; content: [{ type: "text"; text: string }] }> {
  if (name !== "human.approve") {
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] };
  }

  try {
    const runId = args.runId as string;
    const approver = (args.approver as string) ?? "human";
    const replyText = args.replyText as string;
    const idempotencyKey = args.idempotencyKey as string;

    // Parse the human reply into a normalized decision
    const decision = parseHumanApprovalYesNo(replyText);

    // Record the vote
    const voteResult = await ctx.hitlTracker.recordVoteReceived(runId);

    // If vote count is met, resolve the approval
    if (voteResult.complete) {
      await ctx.hitlTracker.resolveApproval(runId);
    }

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
          }),
        },
      ],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
  }
}
