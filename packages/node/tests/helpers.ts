import net from "node:net";
import { vi } from "vitest";
import { ConsensusToolsServer } from "../src/server.js";
import type { ServerDeps } from "../src/server.js";
import type { ConsensusToolsConfig } from "@consensus-tools/schemas";

async function getFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

export function makeConfig(overrides: Record<string, any> = {}, port = 0): ConsensusToolsConfig {
  return {
    mode: "local",
    local: {
      storage: { kind: "json", path: "" },
      server: { enabled: true, host: "127.0.0.1", port, authToken: "", ...overrides.server },
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

export function makeMockDeps(overrides: Partial<ServerDeps> = {}): ServerDeps {
  const config = overrides.config ?? makeConfig();
  return {
    config,
    engine: {
      postJob: vi.fn().mockResolvedValue({ id: "job-1", title: "Test", status: "OPEN" }),
      listJobs: vi.fn().mockResolvedValue([]),
      getJob: vi.fn().mockResolvedValue({ id: "job-1", title: "Test", status: "OPEN" }),
      getStatus: vi.fn().mockResolvedValue({ job: { id: "job-1" }, claims: [], submissions: [] }),
      claimJob: vi.fn().mockResolvedValue({ agentId: "a1", jobId: "job-1", status: "ACTIVE" }),
      submitJob: vi.fn().mockResolvedValue({ id: "sub-1", jobId: "job-1" }),
      vote: vi.fn().mockResolvedValue({ id: "vote-1", jobId: "job-1" }),
      resolveJob: vi.fn().mockResolvedValue({ jobId: "job-1", winners: ["a1"] }),
      recordError: vi.fn(),
    } as any,
    ledger: {
      getBalance: vi.fn().mockResolvedValue(100),
    } as any,
    storage: {
      init: vi.fn(),
      getState: vi.fn().mockResolvedValue({
        jobs: [], bids: [], claims: [], submissions: [], votes: [],
        resolutions: [], ledger: [], audit: [], errors: [], agents: [],
        participants: [], workflows: [], workflowRuns: [], cronSchedules: [],
        hitlApprovals: [], guardResults: [],
      }),
      saveState: vi.fn(),
      update: vi.fn().mockImplementation(async (fn: any) => {
        const state = {
          jobs: [], bids: [], claims: [], submissions: [], votes: [],
          resolutions: [], ledger: [], audit: [], errors: [], agents: [],
          participants: [], workflows: [], workflowRuns: [], cronSchedules: [],
          hitlApprovals: [], guardResults: [],
        };
        const result = await fn(state);
        return { state, result };
      }),
    } as any,
    agentRegistry: {
      listAgents: vi.fn().mockResolvedValue([]),
      createAgent: vi.fn().mockResolvedValue({ id: "a1", name: "Agent", status: "active" }),
    } as any,
    guardEngine: {
      evaluate: vi.fn().mockResolvedValue({ decision: "ALLOW", risk: 0.1 }),
    } as any,
    hitlTracker: {
      recordVoteReceived: vi.fn().mockResolvedValue({ complete: false, total: 1, required: 2 }),
      listPending: vi.fn().mockResolvedValue([]),
    } as any,
    ...overrides,
  };
}

export async function createTestServer(depsOverrides: Partial<ServerDeps> = {}) {
  const port = await getFreePort();
  let config: ConsensusToolsConfig;
  if (depsOverrides.config) {
    config = depsOverrides.config;
    // Override port to avoid collisions
    (config as any).local.server.port = port;
  } else {
    config = makeConfig({}, port);
  }
  const deps = makeMockDeps({ ...depsOverrides, config });
  const server = new ConsensusToolsServer(deps);
  await server.start();
  const baseUrl = `http://127.0.0.1:${port}`;
  return { server, baseUrl, deps };
}
