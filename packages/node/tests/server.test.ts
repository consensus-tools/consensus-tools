import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createTestServer } from "./helpers.js";
import type { ConsensusToolsServer } from "../src/server.js";
import type { ServerDeps } from "../src/server.js";

let server: ConsensusToolsServer;
let baseUrl: string;
let deps: ServerDeps;

beforeAll(async () => {
  const ctx = await createTestServer();
  server = ctx.server;
  baseUrl = ctx.baseUrl;
  deps = ctx.deps;
});

afterAll(async () => {
  await server.stop();
});

describe("ConsensusToolsServer routes", () => {
  it("OPTIONS returns 204 with CORS headers", async () => {
    const res = await fetch(`${baseUrl}/jobs`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("POST /jobs calls engine.postJob", async () => {
    const res = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "a1", title: "Test Job" }),
    });
    expect(res.status).toBe(200);
    expect(deps.engine.postJob).toHaveBeenCalled();
  });

  it("GET /jobs calls engine.listJobs", async () => {
    const res = await fetch(`${baseUrl}/jobs`);
    expect(res.status).toBe(200);
    expect(deps.engine.listJobs).toHaveBeenCalled();
  });

  it("GET /jobs/:id returns job", async () => {
    const res = await fetch(`${baseUrl}/jobs/job-1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("job-1");
  });

  it("GET /jobs/:id returns 404 when not found", async () => {
    (deps.engine.getJob as any).mockResolvedValueOnce(undefined);
    const res = await fetch(`${baseUrl}/jobs/nonexistent`);
    expect(res.status).toBe(404);
  });

  it("POST /jobs/:id/claim calls claimJob", async () => {
    const res = await fetch(`${baseUrl}/jobs/job-1/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "a1", stakeAmount: 0, leaseSeconds: 3600 }),
    });
    expect(res.status).toBe(200);
    expect(deps.engine.claimJob).toHaveBeenCalled();
  });

  it("POST /jobs/:id/submit calls submitJob", async () => {
    const res = await fetch(`${baseUrl}/jobs/job-1/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "a1", summary: "Done", confidence: 0.9 }),
    });
    expect(res.status).toBe(200);
    expect(deps.engine.submitJob).toHaveBeenCalled();
  });

  it("POST /jobs/:id/vote calls vote", async () => {
    const res = await fetch(`${baseUrl}/jobs/job-1/vote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "a1", submissionId: "sub-1", score: 1 }),
    });
    expect(res.status).toBe(200);
    expect(deps.engine.vote).toHaveBeenCalled();
  });

  it("POST /jobs/:id/resolve calls resolveJob", async () => {
    const res = await fetch(`${baseUrl}/jobs/job-1/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "a1" }),
    });
    expect(res.status).toBe(200);
    expect(deps.engine.resolveJob).toHaveBeenCalled();
  });

  it("GET /ledger/:agentId returns balance", async () => {
    const res = await fetch(`${baseUrl}/ledger/a1`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.balance).toBe(100);
  });

  it("POST /api/guard.evaluate calls guardEngine", async () => {
    const res = await fetch(`${baseUrl}/api/guard.evaluate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ boardId: "b1", action: { type: "test", payload: {} } }),
    });
    expect(res.status).toBe(200);
    expect(deps.guardEngine!.evaluate).toHaveBeenCalled();
  });

  it("POST /api/guard.evaluate returns 501 when no guard engine", async () => {
    const ctx = await createTestServer({ guardEngine: undefined });
    try {
      const res = await fetch(`${ctx.baseUrl}/api/guard.evaluate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(501);
    } finally {
      await ctx.server.stop();
    }
  });

  it("POST /api/human.approve records vote", async () => {
    const res = await fetch(`${baseUrl}/api/human.approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: "r1", decision: "YES" }),
    });
    expect(res.status).toBe(200);
    expect(deps.hitlTracker!.recordVoteReceived).toHaveBeenCalledWith("r1");
  });

  it("GET /api/hitl/pending returns pending approvals", async () => {
    const res = await fetch(`${baseUrl}/api/hitl/pending`);
    expect(res.status).toBe(200);
    expect(deps.hitlTracker!.listPending).toHaveBeenCalled();
  });

  it("GET /api/agents lists agents", async () => {
    const res = await fetch(`${baseUrl}/api/agents`);
    expect(res.status).toBe(200);
    expect(deps.agentRegistry!.listAgents).toHaveBeenCalled();
  });

  it("POST /api/agents creates agent", async () => {
    const res = await fetch(`${baseUrl}/api/agents`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "a1", name: "Agent", kind: "internal", scopes: [] }),
    });
    expect(res.status).toBe(201);
    expect(deps.agentRegistry!.createAgent).toHaveBeenCalled();
  });

  it("GET /api/mcp/boards derives boards from jobs", async () => {
    (deps.storage.getState as any).mockResolvedValueOnce({
      jobs: [
        { id: "j1", boardId: "board-a" },
        { id: "j2", boardId: "board-a" },
        { id: "j3", boardId: "board-b" },
      ],
      audit: [], participants: [], workflows: [], workflowRuns: [],
      cronSchedules: [], hitlApprovals: [], guardResults: [],
    });
    const res = await fetch(`${baseUrl}/api/mcp/boards`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
    expect(data.find((b: any) => b.id === "board-a").jobs).toBe(2);
  });

  it("unknown route returns 404", async () => {
    const res = await fetch(`${baseUrl}/nonexistent`);
    expect(res.status).toBe(404);
  });
});
