import type { StorageState, ConsensusToolsConfig } from "@consensus-tools/schemas";

/** Abstract storage contract for consensus state. */
export interface IStorage {
  init(): Promise<void>;
  getState(): Promise<StorageState>;
  saveState(state: StorageState): Promise<void>;
  update<T>(fn: (state: StorageState) => T | Promise<T>): Promise<{ state: StorageState; result: T }>;
}

/** Creates an empty default StorageState. */
export function defaultState(): StorageState {
  return {
    jobs: [],
    bids: [],
    claims: [],
    submissions: [],
    votes: [],
    resolutions: [],
    ledger: [],
    audit: [],
    errors: [],
  };
}

/** Factory: creates the appropriate IStorage based on config. */
export function createStorage(config: ConsensusToolsConfig): IStorage {
  if (config.local.storage.kind === "sqlite") {
    // Lazy import to keep sqlite optional
    const { SqliteStorage } = require("./sqlite.js") as typeof import("./sqlite.js");
    return new SqliteStorage(config.local.storage.path);
  }
  const { JsonStorage } = require("./json.js") as typeof import("./json.js");
  return new JsonStorage(config.local.storage.path);
}
