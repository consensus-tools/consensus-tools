import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { loadCliConfig, resolveCliConfigPath, resolveRemoteBaseUrl } from '../src/cliConfig';

test('resolveRemoteBaseUrl appends /v1/boards/:id when needed', () => {
  assert.equal(resolveRemoteBaseUrl('https://example.com', 'board_all'), 'https://example.com/v1/boards/board_all');
  assert.equal(
    resolveRemoteBaseUrl('https://example.com/v1/boards/board_all', 'board_all'),
    'https://example.com/v1/boards/board_all'
  );
});

test('resolveCliConfigPath prefers CONSENSUS_CONFIG, then local .consensus/config.json, then ~/.consensus/config.json', async () => {
  const prev = process.env.CONSENSUS_CONFIG;
  try {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-tools-cli-'));
    const local = path.join(dir, '.consensus', 'config.json');
    await fs.mkdir(path.dirname(local), { recursive: true });
    await fs.writeFile(local, '{"activeBoard":"remote","boards":{"local":{"type":"local","root":"~","jobsPath":"jobs","ledgerPath":"ledger.json"},"remote":{"type":"remote","url":"https://x","boardId":"b","auth":{"type":"apiKey","apiKeyEnv":"CONSENSUS_API_KEY"}}},"defaults":{"policy":"SINGLE_WINNER","reward":1,"stake":1,"leaseSeconds":60}}');

    delete process.env.CONSENSUS_CONFIG;
    assert.equal(resolveCliConfigPath(dir), local);

    process.env.CONSENSUS_CONFIG = '~/mycfg.json';
    assert.equal(resolveCliConfigPath(dir), path.join(os.homedir(), 'mycfg.json'));
  } finally {
    if (prev === undefined) delete process.env.CONSENSUS_CONFIG;
    else process.env.CONSENSUS_CONFIG = prev;
  }
});

test('loadCliConfig returns defaults when config file does not exist', async () => {
  const prev = process.env.CONSENSUS_CONFIG;
  try {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'consensus-tools-cli-missing-'));
    process.env.CONSENSUS_CONFIG = path.join(dir, 'missing.json');
    const cfg = await loadCliConfig(dir);
    assert.equal(cfg.activeBoard, 'remote');
    assert.equal(cfg.boards.remote.boardId, 'board_all');
  } finally {
    if (prev === undefined) delete process.env.CONSENSUS_CONFIG;
    else process.env.CONSENSUS_CONFIG = prev;
  }
});

