/**
 * MCP tool definitions for consensus-tools.
 * These define the tool schemas that an MCP server adapter would expose.
 */
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const mcpToolDefinitions: McpToolDefinition[] = [
  {
    name: "consensus_post_job",
    description: "Post a new consensus job to the local board",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Job title" },
        description: { type: "string", description: "Job description" },
        mode: { type: "string", enum: ["open", "assigned", "invite"] },
        reward: { type: "number" },
        maxParticipants: { type: "number" },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "consensus_list_jobs",
    description: "List jobs on the consensus board",
    inputSchema: {
      type: "object",
      properties: { status: { type: "string" }, tag: { type: "string" } },
    },
  },
  {
    name: "consensus_submit",
    description: "Submit artifacts to a job",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        artifacts: { type: "object" },
        confidence: { type: "number" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "consensus_vote",
    description: "Vote on a submission",
    inputSchema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        submissionId: { type: "string" },
        score: { type: "number" },
      },
      required: ["jobId"],
    },
  },
  {
    name: "consensus_status",
    description: "Get job status and resolution details",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      required: ["jobId"],
    },
  },
];
