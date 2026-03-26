import { describe, it, expect, afterAll, beforeAll } from "vitest";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import net from "node:net";
import { JobEngine, LedgerEngine } from "@consensus-tools/core";
import { JsonStorage } from "@consensus-tools/storage";
import type { ConsensusToolsConfig } from "@consensus-tools/schemas";
import { ConsensusToolsServer } from "../src/server.js";

// ── Helpers ──────────────────────────────────────────────────────────

function tmpStoragePath(): string {
  return path.join(os.tmpdir(), `ct-integration-${randomUUID()}.json`);
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

function makeConfig(port: number): ConsensusToolsConfig {
  return {
    mode: "local",
    local: {
      storage: { kind: "json", path: "" },
      server: { enabled: true, host: "127.0.0.1", port, authToken: "" },
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
    agentIdentity: { agentIdSource: "manual", manualAgentId: "test" },
    safety: { requireOptionalToolsOptIn: false, allowNetworkSideEffects: false },
  } as ConsensusToolsConfig;
}

// ── Test setup ───────────────────────────────────────────────────────

let server: ConsensusToolsServer;
let baseUrl: string;
let storagePath: string;

beforeAll(async () => {
  storagePath = tmpStoragePath();
  const port = await getFreePort();
  const config = makeConfig(port);

  const storage = new JsonStorage(storagePath);
  await storage.init();

  const ledger = new LedgerEngine(storage, config);
  const engine = new JobEngine(storage, ledger, config);

  server = new ConsensusToolsServer({
    config,
    engine,
    ledger,
    storage,
  });

  await server.start();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await server.stop();
  await fs.unlink(storagePath).catch(() => {});
});

// ── Tests ────────────────────────────────────────────────────────────

describe("SDK-Node integration (real engine)", () => {
  it("POST /jobs with empty body returns 400 with validation errors", async () => {
    const res = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("POST /jobs with valid body returns 200 with created job", async () => {
    const res = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "agent-1", title: "Integration Test Job" }),
    });
    expect(res.status).toBe(200);
    const job = await res.json();
    expect(job.id).toBeDefined();
    expect(job.title).toBe("Integration Test Job");
    expect(job.status).toBe("OPEN");
  });

  it("GET /healthz returns 200 with { status: 'ok' }", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  it("full flow: POST job then GET job returns matching fields", async () => {
    // Create a job
    const postRes = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "agent-flow",
        title: "Flow Test Job",
        description: "Testing the full flow",
        tags: ["integration"],
        reward: 25,
      }),
    });
    expect(postRes.status).toBe(200);
    const created = await postRes.json();
    expect(created.id).toBeDefined();

    // Retrieve the same job
    const getRes = await fetch(`${baseUrl}/jobs/${created.id}`);
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();

    // Verify fields match
    expect(fetched.id).toBe(created.id);
    expect(fetched.title).toBe("Flow Test Job");
    expect(fetched.description).toBe("Testing the full flow");
    expect(fetched.status).toBe("OPEN");
    expect(fetched.tags).toContain("integration");
    expect(fetched.reward).toBe(25);
  });
});
