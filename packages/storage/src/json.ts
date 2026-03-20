import { promises as fs } from "node:fs";
import path from "node:path";
import { Mutex } from "./mutex.js";
import { defaultState, applyStorageCaps, type StorageCaps } from "./interface.js";
import type { IStorage } from "./interface.js";
import type { StorageState } from "@consensus-tools/schemas";

export class JsonStorage implements IStorage {
  private readonly filePath: string;
  private readonly mutex = new Mutex();
  private readonly caps: StorageCaps;

  constructor(filePath: string, caps?: StorageCaps) {
    this.filePath = filePath;
    this.caps = caps ?? {};
  }

  async init(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await this.ensureFile();
    });
  }

  async getState(): Promise<StorageState> {
    await this.ensureFile();
    const raw = await fs.readFile(this.filePath, "utf8");
    if (!raw.trim()) {
      const state = defaultState();
      await this.saveState(state);
      return state;
    }
    try {
      const parsed = JSON.parse(raw) as StorageState;
      return parsed;
    } catch (err) {
      throw new Error(`consensus-tools: storage file corrupt at ${this.filePath}. ${String(err)}`);
    }
  }

  async saveState(state: StorageState): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const temp = `${this.filePath}.tmp`;
    await fs.writeFile(temp, JSON.stringify(state, null, 2), "utf8");
    await fs.rename(temp, this.filePath);
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

  private async ensureFile(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await fs.writeFile(this.filePath, JSON.stringify(defaultState(), null, 2), "utf8");
    }
  }
}
