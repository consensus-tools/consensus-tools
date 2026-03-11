import { LocalBoard } from "@consensus-tools/core";
import { createRegistryResolver } from "@consensus-tools/policies";
import { mcpToolDefinitions } from "./tools.js";

export interface McpServerOptions {
  board: LocalBoard;
  agentId?: string;
}

/**
 * Stub MCP server adapter.
 * A real implementation would integrate with the MCP SDK.
 * This provides the tool definitions and a dispatch method.
 */
export class McpServerAdapter {
  private readonly board: LocalBoard;
  private readonly agentId: string;

  constructor(opts: McpServerOptions) {
    this.board = opts.board;
    this.agentId = opts.agentId ?? "mcp-agent";
  }

  /** Returns the tool definitions for MCP registration. */
  getToolDefinitions() {
    return mcpToolDefinitions;
  }

  /** Dispatch a tool call by name. */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const engine = this.board.engine;
    switch (name) {
      case "consensus_post_job":
        return engine.postJob(this.agentId, args as any);
      case "consensus_list_jobs":
        return engine.listJobs(args as any);
      case "consensus_submit":
        return engine.submitJob(this.agentId, args.jobId as string, args as any);
      case "consensus_vote":
        return engine.vote(this.agentId, args.jobId as string, args as any);
      case "consensus_status":
        return engine.getStatus(args.jobId as string);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
