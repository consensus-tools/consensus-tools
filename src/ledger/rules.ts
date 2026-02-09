import type { LedgerEntry } from '../types';

export function computeBalances(entries: LedgerEntry[]): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const entry of entries) {
    balances[entry.agentId] = (balances[entry.agentId] || 0) + entry.amount;
  }
  return balances;
}

export function getBalance(entries: LedgerEntry[], agentId: string): number {
  return entries.reduce((sum, entry) => (entry.agentId === agentId ? sum + entry.amount : sum), 0);
}

export function ensureNonNegative(balance: number, context: string): void {
  if (balance < 0) {
    throw new Error(`consensus-tools: insufficient credits for ${context}`);
  }
}
