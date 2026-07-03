import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/server.js";
import { makeMockCtx } from "./helpers.js";
import type { McpContext } from "../src/context.js";

let client: Client;
let ctx: McpContext;

beforeAll(async () => {
  ctx = makeMockCtx();
  const server = createMcpServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
});

describe("server tool routing", () => {
  it("listTools returns all registered tools", async () => {
    const result = await client.listTools();
    expect(result.tools.length).toBeGreaterThanOrEqual(29);
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("consensus_post_job");
    expect(names).toContain("guard.evaluate");
    expect(names).toContain("agent.register");
    expect(names).toContain("human.approve");
    expect(names).toContain("board.list");
    expect(names).toContain("workflow.create");
    expect(names).toContain("cron.register");
    expect(names).toContain("policy.assign");
  });

  it("callTool dispatches consensus_ prefix to consensus handler", async () => {
    const result = await client.callTool({
      name: "consensus_post_job",
      arguments: { title: "Server Test", description: "Via client" },
    });
    expect(result.isError).toBeUndefined();
    expect(ctx.engine.postJob).toHaveBeenCalled();
  });

  it("callTool dispatches guard. prefix to guard handler", async () => {
    const result = await client.callTool({
      name: "guard.evaluate",
      arguments: {
        boardId: "b1",
        action: { type: "send_email", payload: {} },
      },
    });
    expect(result.isError).toBeUndefined();
    expect(ctx.guardEngine.evaluate).toHaveBeenCalled();
  });

  it("callTool dispatches agent. prefix to agent handler", async () => {
    const result = await client.callTool({
      name: "agent.list",
      arguments: {},
    });
    expect(result.isError).toBeUndefined();
    expect(ctx.agentRegistry.listAgents).toHaveBeenCalled();
  });

  it("callTool dispatches human. prefix to hitl handler", async () => {
    const result = await client.callTool({
      name: "human.approve",
      arguments: { runId: "r1", replyText: "YES", idempotencyKey: "k1" },
    });
    expect(result.isError).toBeUndefined();
  });

  it("callTool dispatches board. prefix to board handler", async () => {
    const result = await client.callTool({
      name: "board.list",
      arguments: {},
    });
    expect(result.isError).toBeUndefined();
  });

  it("callTool returns error for unknown tool", async () => {
    const result = await client.callTool({
      name: "nonexistent_tool",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Tool not found");
  });
});

describe("server resource routing", () => {
  it("listResourceTemplates returns 3 templates", async () => {
    const result = await client.listResourceTemplates();
    expect(result.resourceTemplates).toHaveLength(3);
  });

  it("listResources returns resources for boards with jobs", async () => {
    (ctx.storage.getState as any).mockResolvedValue({
      jobs: [{ boardId: "b1", id: "j1" }],
      bids: [], claims: [], submissions: [], votes: [],
      resolutions: [], ledger: [], audit: [], errors: [],
      agents: [], participants: [], workflows: [], workflowRuns: [],
      cronSchedules: [], hitlApprovals: [], guardResults: [],
    });
    const result = await client.listResources();
    expect(result.resources.length).toBeGreaterThanOrEqual(3);
  });

  it("readResource returns filtered data", async () => {
    (ctx.storage.getState as any).mockResolvedValue({
      jobs: [
        { boardId: "b1", id: "j1", title: "Job 1" },
        { boardId: "b2", id: "j2", title: "Job 2" },
      ],
      bids: [], claims: [], submissions: [], votes: [],
      resolutions: [], ledger: [], audit: [], errors: [],
      agents: [], participants: [], workflows: [], workflowRuns: [],
      cronSchedules: [], hitlApprovals: [], guardResults: [],
    });
    const result = await client.readResource({
      uri: "consensus://boards/b1/jobs",
    });
    expect(result.contents).toHaveLength(1);
    const jobs = JSON.parse(result.contents[0].text as string);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe("j1");
  });
});

describe("server prompt routing", () => {
  it("listPrompts returns 3 prompts", async () => {
    const result = await client.listPrompts();
    expect(result.prompts).toHaveLength(3);
  });

  it("getPrompt returns messages for post-job", async () => {
    const result = await client.getPrompt({
      name: "post-job",
      arguments: { title: "Test Job" },
    });
    expect(result.messages).toHaveLength(1);
    expect((result.messages[0].content as { type: string; text: string }).text).toContain("Test Job");
  });

  it("getPrompt throws for unknown prompt", async () => {
    await expect(
      client.getPrompt({ name: "nonexistent" }),
    ).rejects.toThrow();
  });
});
