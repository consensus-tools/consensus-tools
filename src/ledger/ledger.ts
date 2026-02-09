import type { ConsensusToolsConfig, LedgerEntry, StorageState } from '../types';
import type { IStorage } from '../storage/IStorage';
import { computeBalances, ensureNonNegative, getBalance } from './rules';
import { newId } from '../util/ids';
import { nowIso } from '../util/time';

export class LedgerEngine {
  constructor(private readonly storage: IStorage, private readonly config: ConsensusToolsConfig, private readonly logger?: any) {}

  async getBalance(agentId: string): Promise<number> {
    if (this.config.local.ledger.balancesMode === 'override') {
      await this.applyConfigBalances(this.config.local.ledger.balances, 'override');
    }
    const state = await this.storage.getState();
    return getBalance(state.ledger, agentId);
  }

  async getBalances(): Promise<Record<string, number>> {
    if (this.config.local.ledger.balancesMode === 'override') {
      await this.applyConfigBalances(this.config.local.ledger.balances, 'override');
    }
    const state = await this.storage.getState();
    return computeBalances(state.ledger);
  }

  async faucet(agentId: string, amount: number, reason = 'faucet'): Promise<LedgerEntry> {
    return this.appendEntry({
      id: newId('ledger'),
      at: nowIso(),
      type: 'FAUCET',
      agentId,
      amount,
      reason
    });
  }

  async stake(agentId: string, amount: number, jobId?: string): Promise<LedgerEntry> {
    return this.appendEntry({
      id: newId('ledger'),
      at: nowIso(),
      type: 'STAKE',
      agentId,
      amount: -Math.abs(amount),
      jobId
    });
  }

  async unstake(agentId: string, amount: number, jobId?: string): Promise<LedgerEntry> {
    return this.appendEntry({
      id: newId('ledger'),
      at: nowIso(),
      type: 'UNSTAKE',
      agentId,
      amount: Math.abs(amount),
      jobId
    });
  }

  async payout(agentId: string, amount: number, jobId?: string): Promise<LedgerEntry> {
    return this.appendEntry({
      id: newId('ledger'),
      at: nowIso(),
      type: 'PAYOUT',
      agentId,
      amount: Math.abs(amount),
      jobId
    });
  }

  async slash(agentId: string, amount: number, jobId?: string, reason?: string): Promise<LedgerEntry> {
    return this.appendEntry({
      id: newId('ledger'),
      at: nowIso(),
      type: 'SLASH',
      agentId,
      amount: -Math.abs(amount),
      jobId,
      reason
    });
  }

  async ensureInitialCredits(agentId: string): Promise<void> {
    if (this.config.local.ledger.initialCreditsPerAgent <= 0) return;
    await this.storage.update((state) => {
      const balance = getBalance(state.ledger, agentId);
      if (balance > 0) return;
      state.ledger.push({
        id: newId('ledger'),
        at: nowIso(),
        type: 'FAUCET',
        agentId,
        amount: this.config.local.ledger.initialCreditsPerAgent,
        reason: 'initial_credit'
      });
    });
  }

  async applyConfigBalances(balances: Record<string, number>, mode: 'initial' | 'override' = 'initial'): Promise<void> {
    const entries = balances || {};
    const agentIds = Object.keys(entries);
    if (!agentIds.length) return;
    await this.storage.update((state) => {
      for (const agentId of agentIds) {
        const target = entries[agentId];
        const current = getBalance(state.ledger, agentId);
        if (mode === 'initial' && current > 0) continue;
        const delta = target - current;
        if (!Number.isFinite(delta) || delta === 0) continue;
        const nextBalance = current + delta;
        ensureNonNegative(nextBalance, `${agentId} config balance`);
        state.ledger.push({
          id: newId('ledger'),
          at: nowIso(),
          type: 'ADJUST',
          agentId,
          amount: delta,
          reason: 'config_balance'
        });
      }
    });
  }

  private async appendEntry(entry: LedgerEntry): Promise<LedgerEntry> {
    await this.storage.update((state) => {
      const currentBalance = getBalance(state.ledger, entry.agentId);
      const nextBalance = currentBalance + entry.amount;
      ensureNonNegative(nextBalance, `${entry.agentId} after ${entry.type}`);
      state.ledger.push(entry);
    });
    this.logger?.info?.({ entry }, 'consensus-tools: ledger entry');
    if (this.config.local.ledger.balancesMode === 'override') {
      await this.applyConfigBalances(this.config.local.ledger.balances, 'override');
    }
    return entry;
  }

  async reconcile(state: StorageState): Promise<Record<string, number>> {
    return computeBalances(state.ledger);
  }
}
