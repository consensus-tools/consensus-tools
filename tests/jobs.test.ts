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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-tools-job-'));
  const file = path.join(dir, 'state.json');
  const storage = new JsonStorage(file);
  await storage.init();
  const ledger = new LedgerEngine(storage, defaultConfig);
  const engine = new JobEngine(storage, ledger, defaultConfig);
  return { engine, ledger };
}

test('job lifecycle: post -> claim -> submit -> resolve', async () => {
  const { engine, ledger } = await createEngine();
  await ledger.faucet('agent1', 50, 'test');

  const job = await engine.postJob('agent1', {
    title: 'Test Job',
    description: 'Do the thing',
    reward: 10,
    stakeRequired: 5,
    expiresSeconds: 3600
  });

  const claim = await engine.claimJob('agent1', job.id, { stakeAmount: 5, leaseSeconds: 3600 });
  assert.equal(claim.jobId, job.id);

  const submission = await engine.submitJob('agent1', job.id, {
    summary: 'Done',
    artifacts: { ok: true },
    confidence: 0.9
  });
  assert.equal(submission.jobId, job.id);

  const resolution = await engine.resolveJob('agent1', job.id, {});
  assert.equal(resolution.jobId, job.id);
  assert.equal(resolution.winners[0], 'agent1');

  const balance = await ledger.getBalance('agent1');
  assert.ok(balance >= 55);
});
