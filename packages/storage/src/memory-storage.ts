import { Mutex } from "./mutex.js";
import { defaultState, applyStorageCaps, type StorageCaps } from "./interface.js";
import type { IStorage } from "./interface.js";
import type { StorageState } from "@consensus-tools/schemas";

/**
 * In-memory storage implementation for development and testing.
 * State is lost on process exit — not suitable for production use.
 */
export class MemoryStorage implements IStorage {
  private state: StorageState | null = null;
  private readonly mutex = new Mutex();
  private readonly caps: StorageCaps;

  constructor(caps?: StorageCaps) {
    this.caps = caps ?? {};
  }

  async init(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (this.state === null) {
        this.state = defaultState();
      }
    });
  }

  async getState(): Promise<StorageState> {
    if (this.state === null) {
      this.state = defaultState();
    }
    return this.state;
  }

  async saveState(state: StorageState): Promise<void> {
    this.state = state;
  }

  async update<T>(fn: (state: StorageState) => T | Promise<T>): Promise<{ state: StorageState; result: T }> {
    return this.mutex.runExclusive(async () => {
      const state = await this.getState();
      const result = await fn(state);
      applyStorageCaps(state, this.caps);
      await this.saveState(state);
      return { state, result };
    });
  }
}
