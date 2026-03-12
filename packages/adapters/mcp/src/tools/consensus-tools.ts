import {
  jobPostInputSchema, submitInputSchema, voteInputSchema,
} from "@consensus-tools/schemas";
import type { McpContext } from "../context.js";

function validationError(issues: unknown[]) {
  return { isError: true as const, content: [{ type: "text" as const, text: JSON.stringify({ error: "Validation failed", details: issues }) }] as [{ type: "text"; text: string }] };
}

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
        const parsed = jobPostInputSchema.safeParse(args);
        if (!parsed.success) return validationError(parsed.error.issues);
        const job = await ctx.engine.postJob(ctx.agentId, parsed.data);
        return { content: [{ type: "text", text: JSON.stringify(job) }] };
      }

      case "consensus_list_jobs": {
        const status = typeof args.status === "string" ? args.status : undefined;
        const tag = typeof args.tag === "string" ? args.tag : undefined;
        const jobs = await ctx.engine.listJobs({ status, tag });
        return { content: [{ type: "text", text: JSON.stringify({ jobs }) }] };
      }

      case "consensus_submit": {
        if (typeof args.jobId !== "string" || !args.jobId) return { isError: true, content: [{ type: "text", text: "jobId is required and must be a string" }] };
        const parsed = submitInputSchema.safeParse(args);
        if (!parsed.success) return validationError(parsed.error.issues);
        const submission = await ctx.engine.submitJob(
          ctx.agentId,
          args.jobId,
          parsed.data,
        );
        return { content: [{ type: "text", text: JSON.stringify(submission) }] };
      }

      case "consensus_vote": {
        if (typeof args.jobId !== "string" || !args.jobId) return { isError: true, content: [{ type: "text", text: "jobId is required and must be a string" }] };
        const parsed = voteInputSchema.safeParse(args);
        if (!parsed.success) return validationError(parsed.error.issues);
        const vote = await ctx.engine.vote(ctx.agentId, args.jobId, parsed.data);
        return { content: [{ type: "text", text: JSON.stringify(vote) }] };
      }

      case "consensus_status": {
        if (typeof args.jobId !== "string" || !args.jobId) return { isError: true, content: [{ type: "text", text: "jobId is required and must be a string" }] };
        const status = await ctx.engine.getStatus(args.jobId);
        return { content: [{ type: "text", text: JSON.stringify(status) }] };
      }

      default:
        return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}
