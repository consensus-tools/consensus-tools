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
        // Derive boards from jobs AND audit events (workflow runs use audit boardId)
        const boardIds = new Set<string>();
        for (const job of state.jobs) {
          if (job.boardId) boardIds.add(job.boardId);
        }
        for (const e of state.audit) {
          const bid = (e.details as Record<string, unknown>)?.boardId as string | undefined;
          if (bid) boardIds.add(bid);
        }
        const boards = Array.from(boardIds).map((id) => ({ id }));
        return { content: [{ type: "text", text: JSON.stringify({ boards }) }] };
      }

      case "board.get": {
        if (!args.id) return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "id is required" }) }] };
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
        if (!args.id) return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "id is required" }) }] };
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
        const rawQuery = (args.query as string) ?? "";
        const limit = Math.min(Math.max((args.limit as number) ?? 100, 1), 500);
        const state = await ctx.storage.getState();

        // Support field-specific search: "type:AGENT_VERDICT", "runId:wfrun_abc", "boardId:workflow-system"
        const fieldMatch = rawQuery.match(/^(\w+):(.+)$/);
        const events = state.audit
          .filter((e) => {
            if (!rawQuery) return true;
            if (fieldMatch) {
              const [, field, value] = fieldMatch;
              if (field === "type") return e.type === value;
              const details = e.details as Record<string, unknown>;
              if (field === "runId") return details?.runId === value;
              if (field === "boardId") return details?.boardId === value;
            }
            return JSON.stringify(e).toLowerCase().includes(rawQuery.toLowerCase());
          })
          .slice(-limit);

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
