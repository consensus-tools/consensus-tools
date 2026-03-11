/**
 * Standalone MCP stdio entry point.
 * Run with: node dist/entry.js
 */
import { LocalBoard, AgentRegistry, GuardEngine, HitlTracker, createStorage } from "@consensus-tools/core";
import { createGuardEvaluatorRegistry } from "@consensus-tools/guards";
import { WorkflowRunner, CronScheduler, prMergeGuardTemplate, linearTaskDecompTemplate, cronAutoAssignTemplate } from "@consensus-tools/workflows";
import { startMcpServer } from "./server.js";
import type { McpContext } from "./context.js";

async function main() {
  const config = {
    version: "0.3.0",
    local: {
      storage: { kind: "json" as const, path: "./data/consensus-state.json" },
      server: { port: 4010 },
      jobDefaults: {
        reward: 100,
        stakeRequired: 10,
        maxParticipants: 5,
        minParticipants: 1,
        expiresSeconds: 3600,
        consensusPolicy: { type: "FIRST_SUBMISSION_WINS" as const },
        slashingPolicy: { enabled: false },
      },
      slashingEnabled: false,
    },
  };

  const storage = createStorage(config as any);
  const board = new LocalBoard(config as any, storage);
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
