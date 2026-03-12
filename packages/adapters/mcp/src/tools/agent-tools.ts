import { agentConfigSchema } from "@consensus-tools/schemas";
import type { McpContext } from "../context.js";

export const tools = [
  {
    name: "agent.register",
    description: "Register a new agent with the agent registry.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Unique agent identifier" },
        name: { type: "string", description: "Human-readable agent name" },
        kind: { type: "string", enum: ["internal", "external"], description: "Agent kind" },
        scopes: {
          type: "array",
          description: "List of allowed action scopes (empty = unrestricted)",
          items: { type: "string" },
        },
        apiKeyHash: { type: "string", description: "API key hash (required for external agents)" },
        metadata: { type: "object", description: "Arbitrary metadata" },
      },
      required: ["id", "name", "kind", "scopes"],
    },
  },
  {
    name: "agent.list",
    description: "List all registered agents.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "agent.suspend",
    description: "Suspend an active agent by ID. Suspended agents cannot perform actions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Agent ID to suspend" },
      },
      required: ["id"],
    },
  },
  {
    name: "agent.activate",
    description: "Re-activate a suspended agent by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Agent ID to activate" },
      },
      required: ["id"],
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
      case "agent.register": {
        const parsed = agentConfigSchema.safeParse(args);
        if (!parsed.success) {
          return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Validation failed", details: parsed.error.issues }) }] };
        }
        const agent = await ctx.agentRegistry.createAgent(parsed.data);
        return { content: [{ type: "text", text: JSON.stringify(agent) }] };
      }

      case "agent.list": {
        const agents = await ctx.agentRegistry.listAgents();
        return { content: [{ type: "text", text: JSON.stringify({ agents }) }] };
      }

      case "agent.suspend": {
        if (!args.id) return { isError: true, content: [{ type: "text", text: "id is required" }] };
        const agent = await ctx.agentRegistry.suspendAgent(args.id as string);
        if (!agent) {
          return { isError: true, content: [{ type: "text", text: `Agent not found: ${args.id}` }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(agent) }] };
      }

      case "agent.activate": {
        if (!args.id) return { isError: true, content: [{ type: "text", text: "id is required" }] };
        const agent = await ctx.agentRegistry.activateAgent(args.id as string);
        if (!agent) {
          return { isError: true, content: [{ type: "text", text: `Agent not found: ${args.id}` }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(agent) }] };
      }

      default:
        return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}
