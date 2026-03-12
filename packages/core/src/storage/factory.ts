import type { ConsensusToolsConfig } from "@consensus-tools/schemas";
import type { IStorage } from "./interface.js";

/** Factory: creates the appropriate IStorage based on config. */
export async function createStorage(config: ConsensusToolsConfig): Promise<IStorage> {
  if (config.local.storage.kind === "sqlite") {
    // Lazy import to keep sqlite optional
    const { SqliteStorage } = await import("./sqlite.js");
    return new SqliteStorage(config.local.storage.path);
  }
  const { JsonStorage } = await import("./json.js");
  return new JsonStorage(config.local.storage.path);
}
