import { workflowCreateInputSchema, cronRegisterInputSchema } from "@consensus-tools/schemas";
import type { McpContext } from "../context.js";

export const tools = [
  {
    name: "workflow.create",
    description: "Create a new workflow definition.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Workflow name" },
        definition: { type: "object", description: "Workflow definition (step graph)" },
        templateId: { type: "string", description: "Optional template ID to base the workflow on" },
      },
      required: ["name", "definition"],
    },
  },
  {
    name: "workflow.run",
    description: "Execute a workflow by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        workflowId: { type: "string", description: "Workflow ID to run" },
      },
      required: ["workflowId"],
    },
  },
  {
    name: "workflow.list",
    description: "List all registered workflows.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "cron.register",
    description: "Register a cron schedule for a workflow. Replaces any existing schedule for the same workflow.",
    inputSchema: {
      type: "object" as const,
      properties: {
        workflowId: { type: "string", description: "Workflow ID to schedule" },
        cronExpression: {
          type: "string",
          description: "Cron expression (5 fields: min hour dom mon dow)",
        },
      },
      required: ["workflowId", "cronExpression"],
    },
  },
  {
    name: "cron.list",
    description: "List all registered cron schedules.",
    inputSchema: {
      type: "object" as const,
      properties: {},
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
      case "workflow.create": {
        if (!ctx.workflowRunner) {
          return {
            isError: true,
            content: [{ type: "text", text: "Workflow runner is not configured" }],
          };
        }
        const parsed = workflowCreateInputSchema.safeParse(args);
        if (!parsed.success) {
          return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Validation failed", details: parsed.error.issues }) }] };
        }
        const workflow = await ctx.workflowRunner.createWorkflow(
          parsed.data.name,
          parsed.data.definition as Record<string, unknown>,
          parsed.data.templateId,
        );
        return { content: [{ type: "text", text: JSON.stringify(workflow) }] };
      }

      case "workflow.run": {
        if (!ctx.workflowRunner) {
          return {
            isError: true,
            content: [{ type: "text", text: "Workflow runner is not configured" }],
          };
        }
        const run = await ctx.workflowRunner.run(args.workflowId as string);
        return { content: [{ type: "text", text: JSON.stringify(run) }] };
      }

      case "workflow.list": {
        if (!ctx.workflowRunner) {
          return {
            isError: true,
            content: [{ type: "text", text: "Workflow runner is not configured" }],
          };
        }
        const workflows = await ctx.workflowRunner.listWorkflows();
        return { content: [{ type: "text", text: JSON.stringify({ workflows }) }] };
      }

      case "cron.register": {
        if (!ctx.cronScheduler) {
          return {
            isError: true,
            content: [{ type: "text", text: "Cron scheduler is not configured" }],
          };
        }
        const parsed = cronRegisterInputSchema.safeParse(args);
        if (!parsed.success) {
          return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Validation failed", details: parsed.error.issues }) }] };
        }
        const schedule = await ctx.cronScheduler.register(
          parsed.data.workflowId,
          parsed.data.cronExpression,
        );
        return { content: [{ type: "text", text: JSON.stringify(schedule) }] };
      }

      case "cron.list": {
        if (!ctx.cronScheduler) {
          return {
            isError: true,
            content: [{ type: "text", text: "Cron scheduler is not configured" }],
          };
        }
        const schedules = await ctx.cronScheduler.list();
        return { content: [{ type: "text", text: JSON.stringify({ schedules }) }] };
      }

      default:
        return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}
