import type { StorageState } from "@consensus-tools/schemas";

/** Abstract storage contract for consensus state. */
export interface IStorage {
  init(): Promise<void>;
  getState(): Promise<StorageState>;
  saveState(state: StorageState): Promise<void>;
  update<T>(fn: (state: StorageState) => T | Promise<T>): Promise<{ state: StorageState; result: T }>;
}

export interface StorageCaps {
  maxAuditEntries?: number;
  maxLedgerEntries?: number;
  maxGuardResults?: number;
}

const DEFAULT_MAX = 10_000;

/** Trim unbounded arrays to their configured caps, keeping the most recent entries. */
export function applyStorageCaps(state: StorageState, caps: StorageCaps): void {
  const maxAudit = caps.maxAuditEntries ?? DEFAULT_MAX;
  const maxLedger = caps.maxLedgerEntries ?? DEFAULT_MAX;
  const maxGuard = caps.maxGuardResults ?? DEFAULT_MAX;

  if (state.audit.length > maxAudit) {
    state.audit = state.audit.slice(state.audit.length - maxAudit);
  }
  if (state.ledger.length > maxLedger) {
    state.ledger = state.ledger.slice(state.ledger.length - maxLedger);
  }
  if (state.guardResults.length > maxGuard) {
    state.guardResults = state.guardResults.slice(state.guardResults.length - maxGuard);
  }
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
    agents: [],
    participants: [],
    workflows: [],
    workflowRuns: [],
    cronSchedules: [],
    hitlApprovals: [],
    guardResults: [],
    policyAssignments: [],
    consensusVotes: [],
  };
}
