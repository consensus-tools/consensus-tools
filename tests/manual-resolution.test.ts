import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { JsonStorage } from '../src/storage/JsonStorage';
import { LedgerEngine } from '../src/ledger/ledger';
import { JobEngine } from '../src/jobs/engine';
import { defaultConfig } from '../src/config';

async function createEngine() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-tools-manual-resolution-'));
  const file = path.join(dir, 'state.json');
  const storage = new JsonStorage(file);
  await storage.init();
  const ledger = new LedgerEngine(storage, defaultConfig);
  const engine = new JobEngine(storage, ledger, defaultConfig);
  return { engine, ledger };
}

test('manual resolution picks provided submission artifact for TRUSTED_ARBITER', async () => {
  const { engine, ledger } = await createEngine();

  await ledger.faucet('owner', 100, 'test');
  await ledger.faucet('arb', 100, 'test');

  const job = await engine.postJob('owner', {
    title: 'manual trust test',
    description: 'test',
    reward: 1,
    stakeRequired: 0,
    expiresSeconds: 3600,
    consensusPolicy: { type: 'TRUSTED_ARBITER', trustedArbiterAgentId: 'arb' }
  });

  await engine.claimJob('agentA', job.id, { stakeAmount: 0, leaseSeconds: 3600 });
  await engine.claimJob('agentB', job.id, { stakeAmount: 0, leaseSeconds: 3600 });

  await engine.submitJob('agentA', job.id, {
    summary: 'A',
    artifacts: { answer: 'A' },
    confidence: 0.9
  });

  const subB = await engine.submitJob('agentB', job.id, {
    summary: 'B',
    artifacts: { answer: 'B' },
    confidence: 0.1
  });

  const resolution = await engine.resolveJob('arb', job.id, {
    manualWinners: ['agentB'],
    manualSubmissionId: subB.id
  });

  assert.deepEqual(resolution.winners, ['agentB']);
  assert.deepEqual(resolution.winningSubmissionIds, [subB.id]);
  assert.deepEqual(resolution.finalArtifact, { answer: 'B' });
});
