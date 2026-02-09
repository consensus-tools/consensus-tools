import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { JsonStorage } from '../src/storage/JsonStorage';
import { LedgerEngine } from '../src/ledger/ledger';
import { defaultConfig } from '../src/config';

async function createTempStorage() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-tools-ledger-'));
  const file = path.join(dir, 'state.json');
  const storage = new JsonStorage(file);
  await storage.init();
  return storage;
}

test('ledger maintains balances deterministically', async () => {
  const storage = await createTempStorage();
  const ledger = new LedgerEngine(storage, defaultConfig);

  await ledger.faucet('agentA', 100, 'test');
  await ledger.stake('agentA', 10, 'job1');
  await ledger.payout('agentA', 5, 'job1');
  await ledger.unstake('agentA', 10, 'job1');

  const balance = await ledger.getBalance('agentA');
  assert.equal(balance, 105);

  const balances = await ledger.getBalances();
  assert.equal(balances.agentA, 105);
});

test('ledger prevents negative balances', async () => {
  const storage = await createTempStorage();
  const ledger = new LedgerEngine(storage, defaultConfig);

  await ledger.faucet('agentB', 5, 'test');
  await assert.rejects(() => ledger.stake('agentB', 10, 'job2'));
});
