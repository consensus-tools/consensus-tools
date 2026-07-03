import { describe, it, expect, beforeAll, afterAll } from "vitest";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import {
  JobEngine, LedgerEngine,
  AgentRegistry, GuardEngine, HitlTracker,
} from "@consensus-tools/core";
import { JsonStorage } from "@consensus-tools/storage";
import type { ConsensusToolsConfig } from "@consensus-tools/schemas";
import { handle } from "../src/tools/consensus-tools.js";
import { handle as handleAgent } from "../src/tools/agent-tools.js";
import { handle as handleGuard } from "../src/tools/guard-tools.js";
import { handle as handleBoard } from "../src/tools/board-tools.js";
import { handle as handleHitl } from "../src/tools/hitl-tools.js";
import type { McpContext } from "../src/context.js";

// ── Helpers ──────────────────────────────────────────────────────────

function tmpStoragePath(): string {
  return path.join(os.tmpdir(), `ct-mcp-integration-${randomUUID()}.json`);
}

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

function parseContent(result: { content: Array<{ type: string; text: string }> }): any {
  return JSON.parse(result.content[0].text);
}

// ── Test setup ───────────────────────────────────────────────────────

let ctx: McpContext;
let storagePath: string;

beforeAll(async () => {
  storagePath = tmpStoragePath();
  const config = makeConfig();

  const storage = new JsonStorage(storagePath);
  await storage.init();

  const ledger = new LedgerEngine(storage, config);
  const engine = new JobEngine(storage, ledger, config);
  const agentRegistry = new AgentRegistry(storage);
  const guardEngine = new GuardEngine({ storage, agentRegistry });
  const hitlTracker = new HitlTracker({ storage });

  ctx = {
    engine,
    agentRegistry,
    guardEngine,
    hitlTracker,
    storage,
    agentId: "test-agent",
  };
});

// Registering a pending approval starts the HitlTracker deadline timer;
// stop it so vitest can exit.
afterAll(() => {
  ctx.hitlTracker.stop();
});

// ── Tests ────────────────────────────────────────────────────────────

describe("MCP adapter integration (real engine)", () => {
  it("consensus_post_job with valid input returns created job", async () => {
    const result = await handle("consensus_post_job", {
      title: "MCP Integration Job",
      description: "Testing MCP with real engine",
    }, ctx);

    expect((result as any).isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.id).toBeDefined();
    expect(data.title).toBe("MCP Integration Job");
    expect(data.status).toBe("OPEN");
  });

  it("consensus_post_job with missing title returns validation error", async () => {
    const result = await handle("consensus_post_job", {
      description: "No title provided",
    }, ctx);

    expect((result as any).isError).toBe(true);
    const data = parseContent(result);
    expect(data.error).toBeDefined();
    expect(data.details).toBeDefined();
  });

  it("consensus_list_jobs returns list of jobs", async () => {
    // Ensure at least one job exists
    await handle("consensus_post_job", {
      title: "List Test Job",
      description: "For listing",
    }, ctx);

    const result = await handle("consensus_list_jobs", {}, ctx);
    expect((result as any).isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.jobs).toBeDefined();
    expect(Array.isArray(data.jobs)).toBe(true);
    expect(data.jobs.length).toBeGreaterThan(0);
  });

  it("consensus_submit with valid jobId submits successfully", async () => {
    // Create a job first
    const postResult = await handle("consensus_post_job", {
      title: "Submit Target Job",
      description: "Job to submit against",
    }, ctx);
    const job = parseContent(postResult);

    const result = await handle("consensus_submit", {
      jobId: job.id,
      summary: "Integration submission",
      confidence: 0.85,
      artifacts: { file: "output.txt" },
    }, ctx);

    expect((result as any).isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.id).toBeDefined();
    expect(data.jobId).toBe(job.id);
    expect(data.summary).toBe("Integration submission");
    expect(data.confidence).toBe(0.85);
  });

  it("consensus_status returns status for a job", async () => {
    // Create a job first
    const postResult = await handle("consensus_post_job", {
      title: "Status Target Job",
      description: "Job for status check",
    }, ctx);
    const job = parseContent(postResult);

    const result = await handle("consensus_status", { jobId: job.id }, ctx);
    expect((result as any).isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.job).toBeDefined();
    expect(data.job.id).toBe(job.id);
    expect(data.claims).toBeDefined();
    expect(data.submissions).toBeDefined();
  });
});

describe("Agent tools integration (real registry)", () => {
  it("agent.register creates and returns agent", async () => {
    const result = await handleAgent("agent.register", {
      id: "integ-agent-1",
      name: "Integration Agent",
      kind: "internal",
      scopes: ["send_email"],
    }, ctx);
    expect((result as any).isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.id).toBe("integ-agent-1");
    expect(data.name).toBe("Integration Agent");
  });

  it("agent.list returns the registered agent", async () => {
    const result = await handleAgent("agent.list", {}, ctx);
    const data = parseContent(result);
    expect(data.agents.length).toBeGreaterThan(0);
    expect(data.agents.some((a: any) => a.id === "integ-agent-1")).toBe(true);
  });

  it("agent.suspend then activate round-trips", async () => {
    const suspendResult = await handleAgent("agent.suspend", { id: "integ-agent-1" }, ctx);
    expect((suspendResult as any).isError).toBeUndefined();
    const suspended = parseContent(suspendResult);
    expect(suspended.status).toBe("suspended");

    const activateResult = await handleAgent("agent.activate", { id: "integ-agent-1" }, ctx);
    expect((activateResult as any).isError).toBeUndefined();
    const activated = parseContent(activateResult);
    expect(activated.status).toBe("active");
  });
});

describe("Board tools integration (real storage)", () => {
  it("board.list returns boards that have jobs", async () => {
    const result = await handleBoard("board.list", {}, ctx);
    const data = parseContent(result);
    expect(data.boards).toBeDefined();
  });

  it("audit.search returns events", async () => {
    const result = await handleBoard("audit.search", {}, ctx);
    expect((result as any).isError).toBeUndefined();
    const data = parseContent(result);
    expect(data.events).toBeDefined();
    expect(data.count).toBeDefined();
  });
});

describe("Guard tools integration (real guard engine)", () => {
  const DECISIONS = ["ALLOW", "BLOCK", "REWRITE", "REQUIRE_HUMAN"];

  it("guard.evaluate returns a valid decision with real engine", async () => {
    const result = await handleGuard("guard.evaluate", {
      boardId: "integ-board",
      action: { type: "agent_action", payload: { irreversible: false } },
    }, ctx);
    expect((result as any).isError).toBeUndefined();
    const data = parseContent(result);
    expect(DECISIONS).toContain(data.decision);
  });

  // These prove the payload-translation fix end-to-end: sent exactly per the
  // advertised MCP schema, the real evaluators must now flag the risk instead of
  // returning ALLOW because the keys never matched.
  it("guard.deployment flags a prod deploy sent as deployEnv:'prod'", async () => {
    const result = await handleGuard("guard.deployment", {
      boardId: "integ-board",
      action: { type: "deployment", payload: { service: "api", version: "abc", deployEnv: "prod" } },
    }, ctx);
    const data = parseContent(result);
    expect(data.decision).not.toBe("ALLOW");
  });

  it("guard.code_merge flags an auth-file change sent as filesChanged", async () => {
    const result = await handleGuard("guard.code_merge", {
      boardId: "integ-board",
      action: { type: "code_merge", payload: { repo: "r", filesChanged: ["src/auth/login.ts"], diff: "tweak" } },
    }, ctx);
    const data = parseContent(result);
    expect(data.decision).not.toBe("ALLOW");
  });

  it("guard.permission_escalation flags a wildcard requestedPermissions grant", async () => {
    const result = await handleGuard("guard.permission_escalation", {
      boardId: "integ-board",
      action: { type: "permission_escalation", payload: { targetUser: "svc", requestedPermissions: ["*"] } },
    }, ctx);
    const data = parseContent(result);
    expect(data.decision).not.toBe("ALLOW");
  });

  // Proves policy.assign is no longer a no-op: an assigned policy makes the board
  // route a high-risk REWRITE to human review instead of a bare REWRITE.
  it("an assigned board policy routes a high-risk action to human review", async () => {
    const prodDeploy = {
      action: { type: "deployment", payload: { service: "api", version: "v1", deployEnv: "prod" } },
    };
    const before = parseContent(
      await handleGuard("guard.deployment", { boardId: "policy-off", ...prodDeploy }, ctx),
    );
    expect(before.decision).toBe("REWRITE");

    await handleGuard("policy.assign", {
      boardId: "policy-on", policyId: "strict", participants: [], quorum: 0.9,
    }, ctx);
    const after = parseContent(
      await handleGuard("guard.deployment", { boardId: "policy-on", ...prodDeploy }, ctx),
    );
    expect(after.decision).toBe("REQUIRE_HUMAN");
  });

  // Per-board thresholds (the schema fields): a board that raises
  // hitlRequiredAboveRisk above the action's risk should NOT escalate to human.
  it("a per-board hitlRequiredAboveRisk threshold controls escalation", async () => {
    const prodDeploy = {
      action: { type: "deployment", payload: { service: "api", version: "v1", deployEnv: "prod" } },
    };
    // prod deploy risk is ~0.8; a 0.99 threshold keeps it a REWRITE, not human review.
    await handleGuard("policy.assign", {
      boardId: "lenient", policyId: "p", participants: [], quorum: 0.7, hitlRequiredAboveRisk: 0.99,
    }, ctx);
    const lenient = parseContent(
      await handleGuard("guard.deployment", { boardId: "lenient", ...prodDeploy }, ctx),
    );
    expect(lenient.decision).toBe("REWRITE");

    // A 0.1 threshold escalates the same action to human review.
    await handleGuard("policy.assign", {
      boardId: "tight", policyId: "p", participants: [], quorum: 0.7, hitlRequiredAboveRisk: 0.1,
    }, ctx);
    const tight = parseContent(
      await handleGuard("guard.deployment", { boardId: "tight", ...prodDeploy }, ctx),
    );
    expect(tight.decision).toBe("REQUIRE_HUMAN");
  });

  it("guard.permission_escalation flags a scoped wildcard in requestedPermissions", async () => {
    const result = parseContent(
      await handleGuard("guard.permission_escalation", {
        boardId: "perm-board",
        action: { type: "permission_escalation", payload: { requestedPermissions: ["s3:read", "iam:*"] } },
      }, ctx),
    );
    expect(["REWRITE", "REQUIRE_HUMAN", "BLOCK"]).toContain(result.decision);
  });
});

describe("Standalone guard HITL (real tracker)", () => {
  const prodDeploy = {
    action: { type: "deployment", payload: { service: "api", version: "v1", deployEnv: "prod" } },
  };

  beforeAll(async () => {
    await handleGuard("policy.assign", {
      boardId: "hitl-board", policyId: "p", participants: [], quorum: 0.7, hitlRequiredAboveRisk: 0.1,
    }, ctx);
  });

  it("REQUIRE_HUMAN registers a pending approval and a human NO resolves it", async () => {
    const result = parseContent(
      await handleGuard("guard.deployment", { boardId: "hitl-board", runId: "hitl-run-1", ...prodDeploy }, ctx),
    );
    expect(result.decision).toBe("REQUIRE_HUMAN");
    expect(result.runId).toBe("hitl-run-1");
    expect(result.next_step).toMatchObject({ tool: "human.approve" });

    const pending = await ctx.hitlTracker.getPendingApproval("hitl-run-1");
    expect(pending).toBeDefined();

    const approve = await handleHitl("human.approve", {
      runId: "hitl-run-1", replyText: "NO", idempotencyKey: "hitl-key-1",
    }, ctx);
    expect((approve as any).isError).toBeUndefined();
    const decision = parseContent(approve);
    expect(decision.decision).toBe("NO");
    expect(decision.complete).toBe(true);

    expect(await ctx.hitlTracker.getPendingApproval("hitl-run-1")).toBeUndefined();
  });

  it("mints a runId when the caller omits one, so human.approve has a handle", async () => {
    const result = parseContent(
      await handleGuard("guard.deployment", { boardId: "hitl-board", ...prodDeploy }, ctx),
    );
    expect(result.decision).toBe("REQUIRE_HUMAN");
    expect(typeof result.runId).toBe("string");
    expect(result.runId.length).toBeGreaterThan(0);

    expect(await ctx.hitlTracker.getPendingApproval(result.runId)).toBeDefined();

    // Resolve it so no pending approval outlives the suite.
    const approve = await handleHitl("human.approve", {
      runId: result.runId, replyText: "YES", idempotencyKey: "hitl-key-2",
    }, ctx);
    expect((approve as any).isError).toBeUndefined();
  });
});
