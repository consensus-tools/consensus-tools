// @consensus-tools/storage
// Storage layer: IStorage contract, JsonStorage, SqliteStorage, Mutex.

export type { IStorage, StorageCaps } from "./interface.js";
export { defaultState, applyStorageCaps } from "./interface.js";
export { createStorage } from "./factory.js";
export { JsonStorage } from "./json.js";
export { SqliteStorage } from "./sqlite.js";
export { Mutex } from "./mutex.js";
