import type { McpContext } from "./context.js";

export const resourceTemplates = [
  {
    uriTemplate: "consensus://boards/{boardId}/jobs",
    name: "Board Jobs",
    description: "List all jobs for a consensus board",
    mimeType: "application/json",
  },
  {
    uriTemplate: "consensus://boards/{boardId}/ledger",
    name: "Board Ledger",
    description: "Ledger entries for a consensus board",
    mimeType: "application/json",
  },
  {
    uriTemplate: "consensus://boards/{boardId}/agents",
    name: "Registered Agents",
    description: "All registered agents for a consensus board",
    mimeType: "application/json",
  },
];

export async function listResources(ctx: McpContext): Promise<Array<{ uri: string; name: string; mimeType: string }>> {
  const state = await ctx.storage.getState();
  const boardIds = new Set<string>();
  for (const job of state.jobs) {
    if (job.boardId) boardIds.add(job.boardId);
  }
  for (const e of state.audit) {
    const bid = (e.details as Record<string, unknown>)?.boardId as string | undefined;
    if (bid) boardIds.add(bid);
  }

  const resources: Array<{ uri: string; name: string; mimeType: string }> = [];
  for (const id of boardIds) {
    resources.push(
      { uri: `consensus://boards/${id}/jobs`, name: `${id} — Jobs`, mimeType: "application/json" },
      { uri: `consensus://boards/${id}/ledger`, name: `${id} — Ledger`, mimeType: "application/json" },
      { uri: `consensus://boards/${id}/agents`, name: `${id} — Agents`, mimeType: "application/json" },
    );
  }
  return resources;
}

export async function readResource(
  uri: string,
  ctx: McpContext,
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  // Parse: consensus://boards/{boardId}/{collection}
  const match = uri.match(/^consensus:\/\/boards\/([^/]+)\/(\w+)$/);
  if (!match) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }
  const [, boardId, collection] = match;
  const state = await ctx.storage.getState();

  switch (collection) {
    case "jobs": {
      const jobs = state.jobs.filter((j) => j.boardId === boardId);
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(jobs) }] };
    }
    case "ledger":
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(state.ledger) }] };
    case "agents":
      return { contents: [{ uri, mimeType: "application/json", text: JSON.stringify(state.agents) }] };
    default:
      throw new Error(`Unknown resource collection: ${collection}`);
  }
}
