import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runConsensusPolicyTests } from './runner/consensusTestRunner';

const scriptPath = path.join(process.cwd(), 'tests', 'runner', 'generation.ts');
const apiKey = process.env.OPENAI_API_KEY || '';
const model = process.env.CODEX_MODEL || 'gpt-5.2';
const agentCount = Number(process.env.CONSENSUS_AGENT_COUNT || 3);

test('consensus policies resolve deterministic answer', async () => {
  const results = await runConsensusPolicyTests({
    scriptPath,
    agentCount,
    apiKey: apiKey || undefined,
    model
  });

  for (const result of results.results) {
    assert.equal(result.finalAnswer, results.expectedAnswer, `policy ${result.policy} did not match expected answer`);
  }
});
