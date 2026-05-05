import { createRequire } from "node:module";
import { Mutex } from "./mutex.js";
import { defaultState, applyStorageCaps, type StorageCaps } from "./interface.js";
import type { IStorage } from "./interface.js";
import type { StorageState } from "@consensus-tools/schemas";

export class SqliteStorage implements IStorage {
  private readonly filePath: string;
  private readonly mutex = new Mutex();
  private readonly caps: StorageCaps;
  private db: any;

  constructor(filePath: string, caps?: StorageCaps) {
    this.filePath = filePath;
    this.caps = caps ?? {};
  }

  async init(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      this.ensureDb();
      this.db.prepare("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT)").run();
      const row = this.db.prepare("SELECT value FROM kv WHERE key = ?").get("state");
      if (!row) {
        this.db.prepare("INSERT INTO kv (key, value) VALUES (?, ?)").run("state", JSON.stringify(defaultState()));
      }
    });
  }

  async getState(): Promise<StorageState> {
    this.ensureDb();
    const row = this.db.prepare("SELECT value FROM kv WHERE key = ?").get("state");
    if (!row?.value) {
      const state = defaultState();
      await this.saveState(state);
      return state;
    }
    return JSON.parse(row.value) as StorageState;
  }

  async saveState(state: StorageState): Promise<void> {
    this.ensureDb();
    this.db
      .prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run("state", JSON.stringify(state));
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

  private ensureDb(): void {
    if (this.db) return;
    let BetterSqlite3: any;
    try {
      const require = createRequire(import.meta.url);
      BetterSqlite3 = require("better-sqlite3");
    } catch (err) {
      throw new Error(
        "consensus-tools: sqlite storage selected but better-sqlite3 is not installed. Install it or switch to storage.kind=\"json\".",
        { cause: err },
      );
    }
    this.db = new BetterSqlite3(this.filePath);
  }
}
