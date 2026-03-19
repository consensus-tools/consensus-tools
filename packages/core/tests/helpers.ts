import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { JsonStorage } from "@consensus-tools/storage";
import { LedgerEngine } from "../src/ledger/ledger.js";
import { JobEngine } from "../src/engine/engine.js";
import type { ConsensusToolsConfig } from "@consensus-tools/schemas";

export function makeConfig(overrides: Record<string, any> = {}): ConsensusToolsConfig {
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
      ...overrides,
    },
    global: { baseUrl: "", accessToken: "" },
    agentIdentity: { agentIdSource: "manual", manualAgentId: "test" },
    safety: { requireOptionalToolsOptIn: false, allowNetworkSideEffects: false },
  } as ConsensusToolsConfig;
}

export async function createTempStorage() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "consensus-tools-test-"));
  const filePath = path.join(dir, "state.json");
  const storage = new JsonStorage(filePath);
  await storage.init();
  return { storage, filePath, dir };
}

export async function createEngine(configOverrides: Record<string, any> = {}) {
  const { storage } = await createTempStorage();
  const config = makeConfig(configOverrides);
  const ledger = new LedgerEngine(storage, config);
  const engine = new JobEngine(storage, ledger, config);
  return { engine, ledger, storage, config };
}
