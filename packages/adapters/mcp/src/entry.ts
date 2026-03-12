/**
 * Standalone MCP stdio entry point.
 * Run with: node dist/entry.js
 */
import { LocalBoard, AgentRegistry, GuardEngine, HitlTracker, createStorage } from "@consensus-tools/core";
import { createGuardEvaluatorRegistry } from "@consensus-tools/guards";
import { WorkflowRunner, CronScheduler, prMergeGuardTemplate, linearTaskDecompTemplate, cronAutoAssignTemplate } from "@consensus-tools/workflows";
import type { ConsensusToolsConfig } from "@consensus-tools/schemas";
import { startMcpServer } from "./server.js";
import type { McpContext } from "./context.js";

async function main() {
  const config: ConsensusToolsConfig = {
    mode: "local",
    local: {
      storage: { kind: "json", path: "./data/consensus-state.json" },
      server: { enabled: true, host: "127.0.0.1", port: 4010, authToken: "" },
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
      manualAgentId: "mcp-agent",
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
  const hitlTracker = new HitlTracker({ storage });

  const workflowRunner = new WorkflowRunner(storage);
  workflowRunner.registerTemplate(prMergeGuardTemplate);
  workflowRunner.registerTemplate(linearTaskDecompTemplate);
  workflowRunner.registerTemplate(cronAutoAssignTemplate);

  const cronScheduler = new CronScheduler(storage, async (workflowId) => { await workflowRunner.run(workflowId); });

  const ctx: McpContext = {
    engine: board.engine,
    agentRegistry,
    guardEngine,
    hitlTracker,
    storage,
    agentId: "mcp-agent",
    workflowRunner,
    cronScheduler,
  };

  await startMcpServer(ctx);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
