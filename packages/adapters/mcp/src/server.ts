import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { McpContext } from "./context.js";

import { tools as guardTools, handle as handleGuard } from "./tools/guard-tools.js";
import { tools as agentTools, handle as handleAgent } from "./tools/agent-tools.js";
import { tools as consensusTools, handle as handleConsensus } from "./tools/consensus-tools.js";
import { tools as hitlTools, handle as handleHitl } from "./tools/hitl-tools.js";
import { tools as boardTools, handle as handleBoard } from "./tools/board-tools.js";
import { tools as workflowTools, handle as handleWorkflow } from "./tools/workflow-tools.js";
import { resourceTemplates, listResources, readResource } from "./resources.js";
import { prompts, getPrompt } from "./prompts.js";

const allTools = [
  ...guardTools,
  ...agentTools,
  ...consensusTools,
  ...hitlTools,
  ...boardTools,
  ...workflowTools,
];

type ToolHandler = (name: string, args: Record<string, unknown>, ctx: McpContext) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

const handlers: Array<{ prefix: string; names: Set<string>; handler: ToolHandler }> = [
  { prefix: "guard.", names: new Set(guardTools.map((t) => t.name)), handler: handleGuard },
  { prefix: "agent.", names: new Set(agentTools.map((t) => t.name)), handler: handleAgent },
  { prefix: "consensus_", names: new Set(consensusTools.map((t) => t.name)), handler: handleConsensus },
  { prefix: "human.", names: new Set(hitlTools.map((t) => t.name)), handler: handleHitl },
  { prefix: "board.|run.|audit.", names: new Set(boardTools.map((t) => t.name)), handler: handleBoard },
  { prefix: "workflow.|cron.", names: new Set(workflowTools.map((t) => t.name)), handler: handleWorkflow },
];

export function createMcpServer(ctx: McpContext): Server {
  const server = new Server(
    { name: "consensus-tools", version: "0.9.1" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  // ── Tools ─────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;

    for (const h of handlers) {
      if (h.names.has(name)) {
        return h.handler(name, a, ctx);
      }
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Tool not found: ${name}` }],
    };
  });

  // ── Resources ─────────────────────────────────────────────
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    return { resourceTemplates };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = await listResources(ctx);
    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return readResource(request.params.uri, ctx);
  });

  // ── Prompts ───────────────────────────────────────────────
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    return getPrompt(
      request.params.name,
      (request.params.arguments ?? {}) as Record<string, string>,
    );
  });

  return server;
}

export async function startMcpServer(ctx: McpContext): Promise<void> {
  const server = createMcpServer(ctx);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Consensus MCP Server running on stdio");
}
