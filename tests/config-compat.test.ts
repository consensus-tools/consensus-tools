import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultConfig, loadConfig, validateConfig } from '../src/config';

test('config compatibility: validateConfig accepts SINGLE_WINNER alias', () => {
  const cfg = JSON.parse(JSON.stringify(defaultConfig));
  cfg.local.jobDefaults.consensusPolicy.type = 'SINGLE_WINNER';

  const result = validateConfig(cfg);
  assert.equal(result.errors.length, 0);
});

test('config compatibility: loadConfig normalizes SINGLE_WINNER to FIRST_SUBMISSION_WINS', () => {
  const loaded = loadConfig({
    config: {
      getPluginConfig: () => ({
        mode: 'local',
        local: {
          jobDefaults: {
            consensusPolicy: { type: 'SINGLE_WINNER', trustedArbiterAgentId: '' }
          }
        }
      })
    }
  });

  assert.equal(loaded.local.jobDefaults.consensusPolicy.type, 'FIRST_SUBMISSION_WINS');
});

test('config compatibility: partial/empty plugin config still validates after defaults merge', () => {
  const loaded = loadConfig({
    config: {
      getPluginConfig: () => ({})
    }
  });

  const result = validateConfig(loaded);
  assert.equal(result.errors.length, 0);
  assert.equal(result.config.mode, 'local');
});
