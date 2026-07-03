/**
 * Standalone MCP stdio entry point.
 * Run with: npx @consensus-tools/mcp
 */
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { LocalBoard, AgentRegistry, GuardEngine, HitlTracker } from "@consensus-tools/core";
import { createStorage } from "@consensus-tools/storage";
import { createGuardEvaluatorRegistry } from "@consensus-tools/guards";
import { WorkflowRunner, CronScheduler, prMergeGuardTemplate, linearTaskDecompTemplate, cronAutoAssignTemplate } from "@consensus-tools/workflows";
import type { ConsensusToolsConfig } from "@consensus-tools/schemas";
import { startMcpServer } from "./server.js";
import type { McpContext } from "./context.js";

function resolveStoragePath(): string {
  if (process.env.CONSENSUS_STORAGE_PATH) return process.env.CONSENSUS_STORAGE_PATH;
  const base = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(base, "consensus-tools", "state.json");
}

async function main() {
  const storagePath = resolveStoragePath();
  mkdirSync(dirname(storagePath), { recursive: true });

  const agentId = process.env.CONSENSUS_AGENT_ID || "mcp-agent";

  const config: ConsensusToolsConfig = {
    mode: "local",
    local: {
      storage: { kind: "json", path: storagePath },
      server: { enabled: false, host: "127.0.0.1", port: 4010, authToken: "" },
      jobDefaults: {
        reward: 100,
        stakeRequired: 10,
        maxParticipants: 5,
        minParticipants: 1,
        expiresSeconds: 3600,
        consensusPolicy: { type: "FIRST_SUBMISSION_WINS" },
        slashingPolicy: { enabled: false, slashPercent: 0, slashFlat: 0 },
      },
      slashingEnabled: false,
      ledger: {
        faucetEnabled: true,
        initialCreditsPerAgent: 1000,
        balances: {},
      },
    },
    global: {
      baseUrl: "https://api.consensus.tools",
      accessToken: "",
    },
    agentIdentity: {
      agentIdSource: "manual",
      manualAgentId: agentId,
    },
    safety: {
      requireOptionalToolsOptIn: false,
      allowNetworkSideEffects: false,
    },
  };

  const storage = await createStorage(config);
  const board = new LocalBoard(config, storage);
  await board.init();

  const agentRegistry = new AgentRegistry(storage);
  const evaluatorRegistry = createGuardEvaluatorRegistry();
  const guardEngine = new GuardEngine({ storage, agentRegistry, evaluatorRegistry });

  // onExpiry is what makes autoDecisionOnExpiry real: without it, an expired
  // approval only flips to "expired" in storage and a paused workflow stays
  // "waiting" forever. workflowRunner is assigned below, before any timer can fire
  // (the tracker's first deadline check is at least one interval away).
  const hitlTracker = new HitlTracker({
    storage,
    onExpiry: async (approval, decision) => {
      const state = await storage.getState();
      const run = state.workflowRuns.find((r) => r.runId === approval.runId);
      if (run) {
        await workflowRunner.resume(run.workflowId, approval.runId, decision, "system:hitl-timeout");
      }
      // Standalone guard escalations have no workflow to resume; the approval's
      // "expired" status is the fail-closed outcome (it can no longer be approved).
    },
  });

  // Wire the node executor so node-graph workflows actually execute (guard nodes,
  // HITL pause/resume). Without these deps the runner silently no-ops node graphs
  // and no HITL approval can ever be produced, leaving human.approve inert.
  const workflowRunner = new WorkflowRunner(storage, {
    storage,
    guardEngine,
    hitlTracker,
    jobEngine: board.engine,
  });
  workflowRunner.registerTemplate(prMergeGuardTemplate);
  workflowRunner.registerTemplate(linearTaskDecompTemplate);
  workflowRunner.registerTemplate(cronAutoAssignTemplate);

  const cronScheduler = new CronScheduler(storage, async (workflowId) => { await workflowRunner.run(workflowId); });

  // Arm the cron timer if schedules were persisted in a previous session — otherwise
  // registered crons silently never fire after a server restart. `?? []` because a
  // state.json persisted before cronSchedules existed has no such key (JsonStorage
  // does not backfill missing collections).
  const initialState = await storage.getState();
  if ((initialState.cronSchedules ?? []).some((s) => s.enabled)) {
    cronScheduler.start();
  }

  // Likewise re-arm HITL deadline enforcement for pending approvals persisted by a
  // previous process — approvals that expired while the server was down auto-resolve
  // (BLOCK) immediately instead of hanging forever.
  await hitlTracker.resumeDeadlineTracking();

  const ctx: McpContext = {
    engine: board.engine,
    agentRegistry,
    guardEngine,
    hitlTracker,
    storage,
    agentId,
    workflowRunner,
    cronScheduler,
  };

  // Clean shutdown: the cron and HITL timers are setInterval-backed and keep the
  // Node event loop alive, so once either is armed the stdio server would otherwise
  // linger as a zombie after the client disconnects (stdin EOF). Stop the timers on
  // EOF / SIGINT / SIGTERM so the process exits with its client.
  let shuttingDown = false;
  const shutdown = (code: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    cronScheduler.stop();
    hitlTracker.stop();
    process.exit(code);
  };
  process.stdin.on("end", () => shutdown(0));
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  await startMcpServer(ctx);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
