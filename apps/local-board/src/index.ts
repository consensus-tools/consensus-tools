import { JobEngine, LedgerEngine, GuardEngine, HitlTracker, createStorage } from "@consensus-tools/core";
import { createRegistryResolver } from "@consensus-tools/policies";
import { ConsensusToolsServer } from "@consensus-tools/sdk-node";
import { WorkflowRunner } from "@consensus-tools/workflows";
import { CredentialManager } from "@consensus-tools/secrets";
import type { ConsensusToolsConfig } from "@consensus-tools/schemas";

const config: ConsensusToolsConfig = {
  mode: "local",
  local: {
    storage: { kind: "json", path: "./.data/consensus.json" },
    server: { enabled: true, host: "127.0.0.1", port: 9888, authToken: "" },
    slashingEnabled: false,
    jobDefaults: {
      reward: 10, stakeRequired: 1, maxParticipants: 3, minParticipants: 1, expiresSeconds: 86400,
      consensusPolicy: { type: "FIRST_SUBMISSION_WINS" },
      slashingPolicy: { enabled: false, slashPercent: 0, slashFlat: 0 },
    },
    consensusPolicies: {},
    ledger: { faucetEnabled: true, initialCreditsPerAgent: 100, balancesMode: "initial", balances: {} },
  },
  global: { baseUrl: "http://localhost:9888", accessToken: "" },
  agentIdentity: { agentIdSource: "manual", manualAgentId: "api-server" },
  safety: { requireOptionalToolsOptIn: false, allowNetworkSideEffects: false },
};

async function main() {
  const storage = await createStorage(config);
  await storage.init();

  const ledger = new LedgerEngine(storage, config);
  const resolver = createRegistryResolver();
  const engine = new JobEngine(storage, ledger, config, undefined, resolver);
  const guardEngine = new GuardEngine({ storage });
  const hitlTracker = new HitlTracker({ storage });
  const workflowRunner = new WorkflowRunner(storage, { storage, guardEngine, hitlTracker });
  const credentialManager = new CredentialManager("consensus-tools-local-dev");

  const server = new ConsensusToolsServer({
    config, engine, ledger, storage,
    guardEngine, hitlTracker, workflowRunner,
    credentialManager,
    logger: console,
  });
  await server.start();
  console.log("consensus-tools API server running on http://127.0.0.1:9888");
}

main().catch((err) => { console.error(err); process.exit(1); });
