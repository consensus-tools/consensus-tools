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
  {
    name: "audit.explain",
    description:
      "Generate a human-readable explanation of a guard decision. Requires an LLM — set ANTHROPIC_API_KEY or OPENAI_API_KEY in your environment.",
    inputSchema: {
      type: "object" as const,
      properties: {
        auditId: {
          type: "string",
          description: "The audit_id from a GuardResult to explain",
        },
      },
      required: ["auditId"],
    },
  },
  {
    name: "audit.summary",
    description:
      "Get an aggregate summary of recent guard decisions — domains, outcomes, risk scores, and vote breakdowns.",
    inputSchema: {
      type: "object" as const,
      properties: {
        since: {
          type: "string",
          description: "ISO timestamp — only include decisions after this time (e.g., '2026-03-25T00:00:00Z')",
        },
        domain: {
          type: "string",
          description: "Filter by guard domain (e.g., 'send_email', 'code_merge')",
        },
        decision: {
          type: "string",
          description: "Filter by decision (e.g., 'BLOCK', 'ALLOW')",
        },
        limit: {
          type: "number",
          description: "Maximum number of rows (default: 50)",
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
        if (!args.id) return { isError: true, content: [{ type: "text", text: "id is required" }] };
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
        if (!args.id) return { isError: true, content: [{ type: "text", text: "id is required" }] };
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
            content: [{ type: "text", text: `Run not found: ${id}` }],
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

      case "audit.explain": {
        if (!args.auditId) {
          return { isError: true, content: [{ type: "text", text: "auditId is required" }] };
        }
        const auditId = args.auditId as string;
        const state = await ctx.storage.getState();

        // Find the guard result by audit_id
        const guardResult = state.guardResults.find((r) => r.audit_id === auditId);
        if (!guardResult) {
          return {
            isError: true,
            content: [{ type: "text", text: `No guard result found for audit ID: ${auditId}` }],
          };
        }

        // Check for an LLM API key
        const anthropicKey = process.env.ANTHROPIC_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!anthropicKey && !openaiKey) {
          return {
            isError: true,
            content: [{ type: "text", text: "Set ANTHROPIC_API_KEY or OPENAI_API_KEY to use audit.explain" }],
          };
        }

        // Log which LLM provider is being used (visibility into implicit preference)
        console.error(`[consensus] Using ${anthropicKey ? "Anthropic" : "OpenAI"} for LLM explanation`);

        // Dynamic import to avoid hard dependency
        const { explainDecision, guardResultToExplainInput } = await import("@consensus-tools/core");

        const input = guardResultToExplainInput(guardResult);
        const maxTokens = 1024;
        let llm;
        if (anthropicKey) {
          const Anthropic = (await import("@anthropic-ai/sdk" as string)).default;
          const client = new Anthropic({ apiKey: anthropicKey });
          const model = "claude-sonnet-4-20250514";
          llm = async (prompt: string) => {
            const res = await client.messages.create({
              model,
              max_tokens: maxTokens,
              messages: [{ role: "user", content: prompt }],
            });
            const block = res.content?.[0];
            return block?.type === "text" ? block.text : "";
          };
        } else {
          const OpenAI = (await import("openai" as string)).default;
          const client = new OpenAI({ apiKey: openaiKey });
          const model = "gpt-4o-mini";
          llm = async (prompt: string) => {
            const res = await client.chat.completions.create({
              model,
              messages: [{ role: "user", content: prompt }],
              max_tokens: maxTokens,
            });
            return res.choices?.[0]?.message?.content ?? "";
          };
        }
        const result = await explainDecision(input, { llm });

        if (result.status === "error") {
          return { isError: true, content: [{ type: "text", text: result.error! }] };
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ auditId, narrative: result.narrative }) }],
        };
      }

      case "audit.summary": {
        const { summarizeGuardActivity } = await import("@consensus-tools/core");
        const summary = await summarizeGuardActivity(ctx.storage, {
          since: args.since as string | undefined,
          domain: args.domain as string | undefined,
          decision: args.decision as string | undefined,
          limit: args.limit as number | undefined,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(summary) }],
        };
      }

      default:
        return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}
