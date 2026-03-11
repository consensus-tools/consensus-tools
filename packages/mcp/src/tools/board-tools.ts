import type { McpContext } from "../context.js";

export const tools = [
  {
    name: "board.list",
    description: "List all consensus boards in the local database.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "board.get",
    description: "Get the full record for a single consensus board by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Board ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "run.get",
    description: "Get the full record and event history for a guard run by ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Job or run ID" },
      },
      required: ["id"],
    },
  },
  {
    name: "audit.search",
    description:
      "Full-text search across all guard run audit events. Returns up to 500 matching events.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query string" },
        limit: {
          type: "number",
          description: "Maximum number of events to return (1-500, default: 100)",
        },
      },
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
      case "board.list": {
        const state = await ctx.storage.getState();
        // Derive boards from jobs (unique boardIds)
        const boardIds = new Set<string>();
        for (const job of state.jobs) {
          if (job.boardId) boardIds.add(job.boardId);
        }
        const boards = Array.from(boardIds).map((id) => ({ id }));
        return { content: [{ type: "text", text: JSON.stringify({ boards }) }] };
      }

      case "board.get": {
        const id = args.id as string;
        const state = await ctx.storage.getState();
        // Return jobs, submissions, and resolutions for the board
        const jobs = state.jobs.filter((j) => j.boardId === id);
        const submissions = state.submissions.filter((s) => s.boardId === id);
        const guardResults = state.guardResults.filter(
          (r) => (r as Record<string, unknown>).guard_type !== undefined,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ board: { id, jobs, submissions, guardResults } }),
            },
          ],
        };
      }

      case "run.get": {
        const id = args.id as string;
        const status = await ctx.engine.getStatus(id);
        if (!status.job) {
          // Try to find in guard results
          const state = await ctx.storage.getState();
          const guardResult = state.guardResults.find(
            (r) => r.audit_id === id,
          );
          if (guardResult) {
            const events = state.audit.filter(
              (e) => (e.details as Record<string, unknown>)?.auditId === id,
            );
            return {
              content: [{ type: "text", text: JSON.stringify({ run: guardResult, events }) }],
            };
          }
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ error: `Run not found: ${id}` }) }],
          };
        }
        return { content: [{ type: "text", text: JSON.stringify(status) }] };
      }

      case "audit.search": {
        const query = ((args.query as string) ?? "").toLowerCase();
        const limit = Math.min(Math.max((args.limit as number) ?? 100, 1), 500);
        const state = await ctx.storage.getState();

        const events = state.audit
          .filter((e) => {
            if (!query) return true;
            const text = JSON.stringify(e).toLowerCase();
            return text.includes(query);
          })
          .slice(0, limit);

        return { content: [{ type: "text", text: JSON.stringify({ events, count: events.length }) }] };
      }

      default:
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }] };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: message }) }] };
  }
}
