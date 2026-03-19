import type { ConsensusToolsConfig } from "@consensus-tools/schemas";
import type { IStorage } from "./interface.js";
import type { StorageCaps } from "./interface.js";

/** Factory: creates the appropriate IStorage based on config. */
export async function createStorage(config: ConsensusToolsConfig): Promise<IStorage> {
  const caps: StorageCaps = {
    maxAuditEntries: config.local.storage.maxAuditEntries,
    maxLedgerEntries: config.local.storage.maxLedgerEntries,
    maxGuardResults: config.local.storage.maxGuardResults,
  };
  if (config.local.storage.kind === "sqlite") {
    // Lazy import to keep sqlite optional
    const { SqliteStorage } = await import("./sqlite.js");
    return new SqliteStorage(config.local.storage.path, caps);
  }
  const { JsonStorage } = await import("./json.js");
  return new JsonStorage(config.local.storage.path, caps);
}
