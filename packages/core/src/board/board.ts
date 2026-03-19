import type { ConsensusToolsConfig } from "@consensus-tools/schemas";
import type { IStorage } from "@consensus-tools/storage";
import { JobEngine } from "../engine/engine.js";
import { LedgerEngine } from "../ledger/ledger.js";

/**
 * LocalBoard bundles a JobEngine + LedgerEngine + IStorage into a single
 * convenience object for local-first usage. This is the simplest way to
 * run the consensus protocol locally without any network or framework.
 */
export class LocalBoard {
  readonly engine: JobEngine;
  readonly ledger: LedgerEngine;
  readonly storage: IStorage;

  constructor(
    config: ConsensusToolsConfig,
    storage: IStorage,
    logger?: { info?: (...args: unknown[]) => void },
  ) {
    this.storage = storage;
    this.ledger = new LedgerEngine(this.storage, config, logger);
    this.engine = new JobEngine(this.storage, this.ledger, config, logger);
  }

  async init(): Promise<void> {
    await this.storage.init();
  }
}
