import { JobEngine, LedgerEngine } from "@consensus-tools/core";
import { createStorage } from "@consensus-tools/storage";
import { ConsensusToolsClient } from "@consensus-tools/sdk-client";
import { createRegistryResolver } from "@consensus-tools/policies";
import { loadConfig, resolveAgentId, PLUGIN_ID } from "./config.js";
import { registerTools } from "./tools.js";
import { createService } from "./service.js";
import { createBackend } from "./backend.js";

/**
 * OpenClaw plugin registration entry point.
 */
export async function register(api: Record<string, any>): Promise<void> {
  const logger = api?.logger?.child ? api.logger.child({ plugin: PLUGIN_ID }) : api?.logger;
  const config = loadConfig(api, logger);
  const agentId = resolveAgentId(api, config);

  const storage = await createStorage(config);
  const ledger = new LedgerEngine(storage, config, logger);
  const resolver = createRegistryResolver();
  const engine = new JobEngine(storage, ledger, config, logger, resolver);
  const client = new ConsensusToolsClient({
    baseUrl: config.global.baseUrl,
    accessToken: config.global.accessToken,
    logger,
  });

  const backend = createBackend(config, engine, ledger, client, storage, logger, agentId);

  api.registerCli?.(
    ({ program }: any) => {
      // CLI registration is handled by @consensus-tools/cli if installed.
      // This is a placeholder for backwards compatibility.
      program?.command?.("consensus")?.description?.("consensus-tools commands");
    },
    { commands: ["consensus"] },
  );

  registerTools(api, backend, config, agentId);

  const capabilities = api?.capabilities || api?.agent?.capabilities || [];
  const service = createService(config, backend, agentId, capabilities, logger);
  api.registerService?.({
    id: "consensus-tools",
    start: service.start,
    stop: service.stop,
  });
}
