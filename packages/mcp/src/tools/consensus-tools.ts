import type { McpContext } from "../context.js";

export const tools = [
  {
    name: "consensus_post_job",
    description: "Post a new consensus job to the local board.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Job title" },
        description: { type: "string", description: "Job description" },
        mode: { type: "string", enum: ["SUBMISSION", "VOTING"], description: "Job mode" },
        reward: { type: "number", description: "Reward amount for the job" },
        maxParticipants: { type: "number", description: "Maximum number of participants" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for filtering" },
        priority: { type: "number", description: "Priority level (higher = more urgent)" },
        expiresSeconds: { type: "number", description: "Seconds until expiration" },
        stakeRequired: { type: "number", description: "Minimum stake required to claim" },
        boardId: { type: "string", description: "Board ID to post the job to" },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "consensus_list_jobs",
    description: "List jobs on the consensus board with optional filters.",
    inputSchema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Filter by job status" },
        tag: { type: "string", description: "Filter by tag" },
      },
    },
  },
  {
    name: "consensus_submit",
    description: "Submit artifacts to a job.",
    inputSchema: {
      type: "object" as const,
      properties: {
        jobId: { type: "string", description: "Job ID to submit to" },
        summary: { type: "string", description: "Submission summary" },
        artifacts: { type: "object", description: "Submission artifacts" },
        confidence: { type: "number", description: "Confidence score (0-1)" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "consensus_vote",
    description: "Vote on a submission.",
    inputSchema: {
      type: "object" as const,
      properties: {
        jobId: { type: "string", description: "Job ID to vote on" },
        submissionId: { type: "string", description: "Submission ID to vote for" },
        score: { type: "number", description: "Vote score" },
        rationale: { type: "string", description: "Reason for the vote" },
        weight: { type: "number", description: "Vote weight" },
        stakeAmount: { type: "number", description: "Stake amount for the vote" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "consensus_status",
    description: "Get job status and resolution details.",
    inputSchema: {
      type: "object" as const,
      properties: {
        jobId: { type: "string", description: "Job ID to get status for" },
      },
      required: ["jobId"],
    },
  },
];

export async function handle(
  name: string,
  args: Record<string, unknown>,
  ctx: McpContext,
): Promise<{ content: [{ type: "text"; text: string }] } | { isError: true; content: [{ type: "text"; text: string }] }> {
  try {
    switch (name) {
      case "consensus_post_job": {
        const job = await ctx.engine.postJob(ctx.agentId, args as any);
        return { content: [{ type: "text", text: JSON.stringify(job) }] };
      }

      case "consensus_list_jobs": {
        const jobs = await ctx.engine.listJobs({
          status: args.status as string | undefined,
          tag: args.tag as string | undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify({ jobs }) }] };
      }

      case "consensus_submit": {
        const submission = await ctx.engine.submitJob(
          ctx.agentId,
          args.jobId as string,
          {
            summary: (args.summary as string) ?? "",
            artifacts: (args.artifacts as Record<string, unknown>) ?? {},
            confidence: (args.confidence as number) ?? 0.5,
          },
        );
        return { content: [{ type: "text", text: JSON.stringify(submission) }] };
      }

      case "consensus_vote": {
        const vote = await ctx.engine.vote(ctx.agentId, args.jobId as string, {
          submissionId: args.submissionId as string | undefined,
          score: args.score as number | undefined,
          rationale: args.rationale as string | undefined,
          weight: args.weight as number | undefined,
          stakeAmount: args.stakeAmount as number | undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(vote) }] };
      }

      case "consensus_status": {
        const status = await ctx.engine.getStatus(args.jobId as string);
        return { content: [{ type: "text", text: JSON.stringify(status) }] };
      }

      default:
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
  }
}
