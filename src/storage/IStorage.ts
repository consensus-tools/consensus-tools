import type { ConsensusToolsConfig, StorageState } from '../types';
import { JsonStorage } from './JsonStorage';
import { SqliteStorage } from './SqliteStorage';

export interface IStorage {
  init(): Promise<void>;
  getState(): Promise<StorageState>;
  saveState(state: StorageState): Promise<void>;
  update<T>(fn: (state: StorageState) => T | Promise<T>): Promise<{ state: StorageState; result: T }>;
}

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
    errors: []
  };
}

export function createStorage(config: ConsensusToolsConfig): IStorage {
  if (config.local.storage.kind === 'sqlite') {
    return new SqliteStorage(config.local.storage.path);
  }
  return new JsonStorage(config.local.storage.path);
}
