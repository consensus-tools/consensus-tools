import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

import { JsonStorage } from '../src/storage/JsonStorage';
import { LedgerEngine } from '../src/ledger/ledger';
import { JobEngine } from '../src/jobs/engine';
import { resolveConsensus } from '../src/jobs/consensus';
import { defaultConfig, type ConsensusToolsConfig } from '../src/config';

async function createEngine(opts?: { config?: ConsensusToolsConfig; filePath?: string }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-tools-local-e2e-'));
  const file = opts?.filePath ?? path.join(dir, 'state.json');
  const storage = new JsonStorage(file);
  await storage.init();
  const cfg = opts?.config ?? defaultConfig;
  const ledger = new LedgerEngine(storage, cfg);
  const engine = new JobEngine(storage, ledger, cfg);
  return { dir, file, storage, ledger, engine, cfg };
}

function recomputeFromStatus(status: any, cfg: ConsensusToolsConfig) {
  assert.ok(status.job, 'missing job');
  const job = status.job;
  const submissions = status.submissions ?? [];
  const votes = status.votes ?? [];

  const reputation = (agent: string) => {
    // Mirror engine's simplistic reputation function: default 1, accumulate payouts/slashes.
    // For verification purposes, any deterministic function is OK as long as it matches what engine used.
    let score = 1;
    for (const entry of status.ledger ?? []) {
      if (entry.agentId !== agent) continue;
      if (entry.type === 'PAYOUT') score += entry.amount;
      if (entry.type === 'SLASH') score += entry.amount;
    }
    return Math.max(0.1, score);
  };

  return resolveConsensus({ job, submissions, votes, reputation });
}

test('local engine: resolution is recomputable from stored job/submissions/votes', async () => {
  const { engine, ledger, storage, file } = await createEngine();

  await ledger.faucet('creator', 100, 'test');
  await ledger.faucet('agentA', 50, 'test');
  await ledger.faucet('agentB', 50, 'test');

  const job = await engine.postJob('creator', {
    title: 'Verify recomputation',
    description: 'test',
    reward: 10,
    stakeRequired: 1,
    expiresSeconds: 3600,
    policyKey: 'SINGLE_WINNER'
  });

  await engine.claimJob('agentA', job.id, { stakeAmount: 1, leaseSeconds: 3600 });
  await engine.claimJob('agentB', job.id, { stakeAmount: 1, leaseSeconds: 3600 });

  const s1 = await engine.submitJob('agentA', job.id, { summary: 'A', artifacts: { a: true }, confidence: 0.6 });
  const s2 = await engine.submitJob('agentB', job.id, { summary: 'B', artifacts: { b: true }, confidence: 0.9 });

  const resolution = await engine.resolveJob('creator', job.id, {});
  assert.equal(resolution.jobId, job.id);
  assert.ok(resolution.winningSubmissionIds.length >= 1);

  // New engine instance over same storage file.
  const storage2 = new JsonStorage(file);
  await storage2.init();
  const state = await storage2.getState();

  const status = {
    job: state.jobs.find((j) => j.id === job.id),
    submissions: state.submissions.filter((s) => s.jobId === job.id),
    votes: state.votes.filter((v) => v.jobId === job.id),
    resolution: state.resolutions.find((r) => r.jobId === job.id),
    ledger: state.ledger
  };

  assert.ok(status.resolution, 'missing stored resolution');

  const recomputed = resolveConsensus({
    job: status.job!,
    submissions: status.submissions,
    votes: status.votes,
    reputation: (agent: string) => {
      let score = 1;
      for (const entry of status.ledger) {
        if (entry.agentId !== agent) continue;
        if (entry.type === 'PAYOUT') score += entry.amount;
        if (entry.type === 'SLASH') score += entry.amount;
      }
      return Math.max(0.1, score);
    }
  });

  assert.deepEqual(status.resolution!.winners, recomputed.winners);
  assert.deepEqual(status.resolution!.winningSubmissionIds, recomputed.winningSubmissionIds);
  assert.deepEqual(status.resolution!.finalArtifact, recomputed.finalArtifact);

  // sanity: SINGLE_WINNER currently means "first submission wins" (not highest confidence)
  assert.equal(recomputed.winningSubmissionIds[0], s1.id);
  assert.notEqual(s1.id, s2.id);
});

test('local engine: tampering with stored submissions changes recomputed outcome (not tamper-evident)', async () => {
  const { engine, ledger, file } = await createEngine();

  await ledger.faucet('creator', 100, 'test');
  await ledger.faucet('agentA', 50, 'test');
  await ledger.faucet('agentB', 50, 'test');

  const job = await engine.postJob('creator', {
    title: 'Tamper test',
    description: 'test',
    reward: 10,
    stakeRequired: 1,
    expiresSeconds: 3600,
    policyKey: 'HIGHEST_CONFIDENCE_SINGLE'
  });

  await engine.claimJob('agentA', job.id, { stakeAmount: 1, leaseSeconds: 3600 });
  await engine.claimJob('agentB', job.id, { stakeAmount: 1, leaseSeconds: 3600 });

  const sA = await engine.submitJob('agentA', job.id, { summary: 'A', artifacts: { answer: 'A' }, confidence: 0.2 });
  const sB = await engine.submitJob('agentB', job.id, { summary: 'B', artifacts: { answer: 'B' }, confidence: 0.9 });
  const res1 = await engine.resolveJob('creator', job.id, {});
  assert.equal(res1.winningSubmissionIds[0], sB.id);

  // Tamper: flip confidences directly in the storage file.
  const raw = await fs.readFile(file, 'utf8');
  const state = JSON.parse(raw);
  for (const sub of state.submissions) {
    if (sub.id === sA.id) sub.confidence = 0.95;
    if (sub.id === sB.id) sub.confidence = 0.1;
  }
  await fs.writeFile(file, JSON.stringify(state, null, 2));

  const storage2 = new JsonStorage(file);
  await storage2.init();
  const state2 = await storage2.getState();
  const job2 = state2.jobs.find((j: any) => j.id === job.id);
  const subs2 = state2.submissions.filter((s: any) => s.jobId === job.id);
  const votes2 = state2.votes.filter((v: any) => v.jobId === job.id);
  const recomputed = resolveConsensus({ job: job2, submissions: subs2, votes: votes2, reputation: () => 1 });

  // This demonstrates that if storage is mutable, "verifiable" means "recomputable" not "tamper-evident".
  assert.equal(recomputed.winningSubmissionIds[0], sA.id);
});

test('local engine: resolve authorization invariants (TRUSTED_ARBITER / OWNER_PICK)', async () => {
  const { engine, ledger } = await createEngine();

  await ledger.faucet('owner', 100, 'test');
  await ledger.faucet('arb', 100, 'test');
  await ledger.faucet('agentA', 50, 'test');

  // TRUSTED_ARBITER
  const jobArb = await engine.postJob('owner', {
    title: 'arb job',
    description: 'test',
    reward: 10,
    stakeRequired: 1,
    expiresSeconds: 3600,
    consensusPolicy: { type: 'TRUSTED_ARBITER', trustedArbiterAgentId: 'arb' }
  });

  await engine.claimJob('agentA', jobArb.id, { stakeAmount: 1, leaseSeconds: 3600 });
  const subArb = await engine.submitJob('agentA', jobArb.id, { summary: 'A', artifacts: { ok: true }, confidence: 0.8 });

  await assert.rejects(() => engine.resolveJob('not-arb', jobArb.id, {}));
  await assert.rejects(() => engine.resolveJob('arb', jobArb.id, {}));
  const resArb = await engine.resolveJob('arb', jobArb.id, {
    manualWinners: ['agentA'],
    manualSubmissionId: subArb.id
  });
  assert.equal(resArb.jobId, jobArb.id);
  assert.equal(resArb.winners[0], 'agentA');

  // OWNER_PICK
  const jobOwner = await engine.postJob('owner', {
    title: 'owner pick job',
    description: 'test',
    reward: 10,
    stakeRequired: 1,
    expiresSeconds: 3600,
    consensusPolicy: { type: 'OWNER_PICK', trustedArbiterAgentId: '' }
  });

  await engine.claimJob('agentA', jobOwner.id, { stakeAmount: 1, leaseSeconds: 3600 });
  const subOwner = await engine.submitJob('agentA', jobOwner.id, { summary: 'A', artifacts: { ok: true }, confidence: 0.8 });

  await assert.rejects(() => engine.resolveJob('arb', jobOwner.id, {}));
  await assert.rejects(() => engine.resolveJob('owner', jobOwner.id, {}));
  const resOwner = await engine.resolveJob('owner', jobOwner.id, {
    manualWinners: ['agentA'],
    manualSubmissionId: subOwner.id
  });
  assert.equal(resOwner.jobId, jobOwner.id);
  assert.equal(resOwner.winners[0], 'agentA');
});

test('local engine: slashing + ledger conservation (no submit => slash when enabled)', async () => {
  const cfg: ConsensusToolsConfig = {
    ...defaultConfig,
    local: {
      ...defaultConfig.local,
      slashingEnabled: true,
      jobDefaults: {
        ...defaultConfig.local.jobDefaults,
        slashingPolicy: { enabled: true, slashPercent: 0.5, slashFlat: 0 }
      }
    }
  };

  const { engine, ledger, storage } = await createEngine({ config: cfg });

  await ledger.faucet('creator', 100, 'test');
  await ledger.faucet('agentA', 10, 'test');

  const job = await engine.postJob('creator', {
    title: 'slash job',
    description: 'test',
    reward: 2,
    stakeRequired: 6,
    expiresSeconds: 3600,
    slashingPolicy: { enabled: true, slashPercent: 0.5, slashFlat: 0 }
  });

  await engine.claimJob('agentA', job.id, { stakeAmount: 6, leaseSeconds: 3600 });

  // No submission. Resolve triggers slash (because slashingEnabled + job.slashingPolicy.enabled).
  const res = await engine.resolveJob('creator', job.id, {});
  assert.equal(res.jobId, job.id);
  assert.ok(res.slashes.length === 1, 'expected exactly one slash');
  assert.equal(res.slashes[0].agentId, 'agentA');
  assert.ok(res.slashes[0].amount > 0);
  assert.ok(res.slashes[0].amount <= 6);

  const balance = await ledger.getBalance('agentA');
  assert.ok(balance >= 0, 'balance must never be negative');

  // Ensure ledger has UNSTAKE + SLASH entries.
  const state = await storage.getState();
  const unstake = state.ledger.filter((e) => e.jobId === job.id && e.agentId === 'agentA' && e.type === 'UNSTAKE');
  const slash = state.ledger.filter((e) => e.jobId === job.id && e.agentId === 'agentA' && e.type === 'SLASH');
  assert.equal(unstake.length, 1);
  assert.equal(slash.length, 1);
  assert.ok(slash[0].amount < 0);
});
