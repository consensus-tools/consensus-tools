import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { JsonStorage } from '../src/storage/JsonStorage';

async function createStorage() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-tools-store-'));
  const file = path.join(dir, 'state.json');
  const storage = new JsonStorage(file);
  await storage.init();
  return storage;
}

test('JsonStorage read/write', async () => {
  const storage = await createStorage();
  await storage.update((state) => {
    state.jobs.push({
      id: 'job1',
      title: 'Test',
      description: 'Test',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 1000).toISOString(),
      createdByAgentId: 'agent',
      tags: [],
      priority: 0,
      requiredCapabilities: [],
      inputs: {},
      constraints: {},
      reward: 1,
      stakeRequired: 0,
      maxParticipants: 1,
      minParticipants: 1,
      consensusPolicy: { type: 'SINGLE_WINNER' },
      slashingPolicy: { enabled: false, slashPercent: 0, slashFlat: 0 },
      escrowPolicy: { type: 'mint' },
      status: 'OPEN'
    } as any);
  });

  const state = await storage.getState();
  assert.equal(state.jobs.length, 1);
  assert.equal(state.jobs[0].id, 'job1');
});
