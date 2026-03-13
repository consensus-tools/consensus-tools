import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  JobEngine, LedgerEngine, JsonStorage,
  AgentRegistry, GuardEngine, HitlTracker,
} from "@consensus-tools/core";
import type { ConsensusToolsConfig } from "@consensus-tools/schemas";
import { createMcpServer } from "../src/server.js";
import type { McpContext } from "../src/context.js";

function makeConfig(): ConsensusToolsConfig {
  return {
    mode: "local",
    local: {
      storage: { kind: "json", path: "" },
      server: { enabled: false, host: "127.0.0.1", port: 0, authToken: "" },
      slashingEnabled: false,
      jobDefaults: {
        reward: 10,
        stakeRequired: 0,
        maxParticipants: 10,
        minParticipants: 1,
        expiresSeconds: 3600,
        consensusPolicy: { type: "FIRST_SUBMISSION_WINS" },
        slashingPolicy: { enabled: false, slashPercent: 0, slashFlat: 0 },
      },
      ledger: {
        faucetEnabled: true,
        initialCreditsPerAgent: 100,
        balances: {},
      },
    },
    global: { baseUrl: "", accessToken: "" },
    agentIdentity: { agentIdSource: "manual", manualAgentId: "test-agent" },
    safety: { requireOptionalToolsOptIn: false, allowNetworkSideEffects: false },
  } as ConsensusToolsConfig;
}

let client: Client;
let ctx: McpContext;

beforeAll(async () => {
  const storagePath = path.join(os.tmpdir(), `ct-mcp-protocol-${randomUUID()}.json`);
  const config = makeConfig();
  const storage = new JsonStorage(storagePath);
  await storage.init();
  const ledger = new LedgerEngine(storage, config);
  const engine = new JobEngine(storage, ledger, config);
  const agentRegistry = new AgentRegistry(storage);
  const guardEngine = new GuardEngine({ storage, agentRegistry });
  const hitlTracker = new HitlTracker({ storage });

  ctx = { engine, agentRegistry, guardEngine, hitlTracker, storage, agentId: "test-agent" };

  const server = createMcpServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  client = new Client({ name: "protocol-test", version: "1.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
});

describe("MCP protocol integration (real engines)", () => {
  let jobId: string;

  it("lists all tools via protocol", async () => {
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(29);
  });

  it("posts a job via callTool and gets back a real job", async () => {
    const result = await client.callTool({
      name: "consensus_post_job",
      arguments: { title: "Protocol Test Job", description: "End to end" },
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.id).toBeDefined();
    expect(data.title).toBe("Protocol Test Job");
    expect(data.status).toBe("OPEN");
    jobId = data.id;
  });

  it("lists jobs and finds the posted job", async () => {
    const result = await client.callTool({
      name: "consensus_list_jobs",
      arguments: {},
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.jobs.some((j: any) => j.id === jobId)).toBe(true);
  });

  it("submits to the job", async () => {
    const result = await client.callTool({
      name: "consensus_submit",
      arguments: { jobId, summary: "Protocol submission", confidence: 0.9 },
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.jobId).toBe(jobId);
  });

  it("gets job status with submissions", async () => {
    const result = await client.callTool({
      name: "consensus_status",
      arguments: { jobId },
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.job.id).toBe(jobId);
    expect(data.submissions.length).toBeGreaterThan(0);
  });

  it("registers an agent via protocol", async () => {
    const result = await client.callTool({
      name: "agent.register",
      arguments: { id: "proto-agent", name: "Protocol Agent", kind: "internal", scopes: [] },
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.id).toBe("proto-agent");
  });

  it("lists agents via protocol", async () => {
    const result = await client.callTool({
      name: "agent.list",
      arguments: {},
    });
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.agents.some((a: any) => a.id === "proto-agent")).toBe(true);
  });

  it("evaluates a guard action via protocol", async () => {
    const result = await client.callTool({
      name: "guard.evaluate",
      arguments: {
        boardId: "proto-board",
        action: { type: "agent_action", payload: { toolName: "test" } },
      },
    });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(data.decision).toBeDefined();
  });

  it("reads resources via protocol", async () => {
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates).toHaveLength(3);
  });

  it("gets prompts via protocol", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts).toHaveLength(3);

    const prompt = await client.getPrompt({
      name: "post-job",
      arguments: { title: "Protocol Prompt" },
    });
    expect(prompt.messages).toHaveLength(1);
  });

  it("surfaces handler errors as isError through protocol", async () => {
    const result = await client.callTool({
      name: "consensus_submit",
      arguments: { summary: "no job id" },
    });
    expect(result.isError).toBe(true);
  });

  it("returns error for unknown tool via protocol", async () => {
    const result = await client.callTool({
      name: "totally_fake_tool",
      arguments: {},
    });
    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain("Tool not found");
  });
});
