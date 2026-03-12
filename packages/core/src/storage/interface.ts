import type { StorageState } from "@consensus-tools/schemas";

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
