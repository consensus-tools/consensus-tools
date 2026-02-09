import os from 'node:os';
import { createInterface, type Interface } from 'node:readline/promises';
import process from 'node:process';
import type { ConsensusCliConfig } from './cliConfig';
import { defaultConsensusCliConfig } from './cliConfig';

export type InitWizardResult = {
  config: ConsensusCliConfig;
  // Values are already shell-escaped for `export KEY=<value>` lines.
  env?: Record<string, string>;
};

const POLICY_CHOICES = [
  'HIGHEST_CONFIDENCE_SINGLE',
  'TOP_K_SPLIT',
  'OWNER_PICK',
  'SINGLE_WINNER',
  'MAJORITY_VOTE',
  'WEIGHTED_VOTE_SIMPLE',
  'WEIGHTED_REPUTATION',
  'TRUSTED_ARBITER'
] as const;

function defaultAgentId(): string {
  const fromEnv = process.env.CONSENSUS_AGENT_ID;
  if (fromEnv) return fromEnv;
  let user = 'cli';
  try {
    const u = os.userInfo();
    if (u?.username) user = u.username;
  } catch {
    // ignore
  }
  return `${user}@${os.hostname()}`;
}

function shellEscape(value: string): string {
  // Conservative quoting for bash/zsh.
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`')}"`;
}

function toNumber(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value: string, fallback: number): number {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

async function promptLine(rl: Interface, message: string, fallback?: string): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : '';
  const answer = (await rl.question(`${message}${suffix}: `)).trim();
  return answer || fallback || '';
}

async function promptConfirm(rl: Interface, message: string, fallback: boolean): Promise<boolean> {
  const hint = fallback ? 'Y/n' : 'y/N';
  const answer = (await rl.question(`${message} (${hint}): `)).trim().toLowerCase();
  if (!answer) return fallback;
  if (['y', 'yes'].includes(answer)) return true;
  if (['n', 'no'].includes(answer)) return false;
  return fallback;
}

async function promptSelect<T extends string>(
  rl: Interface,
  message: string,
  choices: Array<{ value: T; label: string }>,
  fallback: T
): Promise<T> {
  process.stdout.write(`${message}\n`);
  for (let i = 0; i < choices.length; i += 1) {
    const c = choices[i];
    process.stdout.write(`  ${i + 1}) ${c.label}\n`);
  }
  const answer = (await rl.question(`Select [${choices.findIndex((c) => c.value === fallback) + 1}]: `)).trim();
  if (!answer) return fallback;
  const idx = Number.parseInt(answer, 10);
  if (Number.isFinite(idx) && idx >= 1 && idx <= choices.length) {
    return choices[idx - 1].value;
  }
  // Allow direct value entry.
  const asValue = answer as T;
  if (choices.some((c) => c.value === asValue)) return asValue;
  return fallback;
}

async function promptPassword(message: string): Promise<string> {
  // Minimal masked input for TTY use. Falls back to visible input if raw mode is unavailable.
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return (await rl.question(`${message} (input will be visible): `)).trim();
    } finally {
      rl.close();
    }
  }

  return await new Promise<string>((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = '';

    stdout.write(`${message}: `);
    stdin.setRawMode(true);
    stdin.resume();

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
    };

    const onData = (buf: Buffer) => {
      const s = buf.toString('utf8');
      if (s === '\r' || s === '\n') {
        cleanup();
        resolve(value);
        return;
      }
      if (s === '\u0003') {
        // Ctrl-C
        cleanup();
        process.exit(130);
      }
      if (s === '\u007f') {
        // backspace
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write('\b \b');
        }
        return;
      }
      // Ignore arrow keys / escape sequences.
      if (s.startsWith('\u001b')) return;
      value += s;
      stdout.write('*');
    };

    stdin.on('data', onData);
  });
}

export async function runInitWizard(rootDir: string): Promise<InitWizardResult> {
  process.stdout.write(
    [
      '+---------------------------------+',
      '| consensus-tools init wizard     |',
      '+---------------------------------+',
      `workspace: ${rootDir}`,
      ''
    ].join('\n') + '\n'
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const mode = await promptSelect<'remote' | 'local'>(
      rl,
      'Where should consensus-tools run?',
      [
        { value: 'remote', label: 'Hosted board (Recommended)' },
        { value: 'local', label: 'Local files (shell scripts; limited)' }
      ],
      'remote'
    );

    const cfg: ConsensusCliConfig = JSON.parse(JSON.stringify(defaultConsensusCliConfig));
    cfg.activeBoard = mode;

    cfg.agentId = await promptLine(rl, 'Default agent id (sent as agentId)', cfg.agentId || defaultAgentId());

    cfg.defaults.policy = await promptSelect<string>(
      rl,
      'Default consensus policy',
      POLICY_CHOICES.map((p) => ({ value: p, label: p })),
      cfg.defaults.policy
    );

    cfg.defaults.reward = toNumber(await promptLine(rl, 'Default reward (credits)', String(cfg.defaults.reward)), cfg.defaults.reward);
    cfg.defaults.stake = toNumber(await promptLine(rl, 'Default stake (credits)', String(cfg.defaults.stake)), cfg.defaults.stake);
    cfg.defaults.leaseSeconds = toInt(
      await promptLine(rl, 'Default leaseSeconds', String(cfg.defaults.leaseSeconds)),
      cfg.defaults.leaseSeconds
    );

    if (mode === 'remote') {
      cfg.boards.remote.url = await promptLine(rl, 'Hosted board URL (no trailing /v1/boards)', cfg.boards.remote.url);
      cfg.boards.remote.boardId = await promptLine(rl, 'Board id', cfg.boards.remote.boardId);
      cfg.boards.remote.auth.apiKeyEnv = await promptLine(
        rl,
        'Env var name for access token',
        cfg.boards.remote.auth.apiKeyEnv
      );

      const writeEnv = await promptConfirm(rl, 'Write .consensus/.env now? (do not commit it)', false);
      if (!writeEnv) return { config: cfg };

      const token = (await promptPassword(`Access token value (${cfg.boards.remote.auth.apiKeyEnv})`)).trim();
      const env = buildEnv(cfg, token);
      return { config: cfg, env };
    }

    cfg.boards.local.root = await promptLine(rl, 'Local board root (used by generated shell scripts)', cfg.boards.local.root);
    return { config: cfg };
  } finally {
    rl.close();
  }
}

function buildEnv(cfg: ConsensusCliConfig, token: string): Record<string, string> {
  const env: Record<string, string> = {};
  env.CONSENSUS_MODE = cfg.activeBoard === 'remote' ? 'remote' : 'local';
  env.CONSENSUS_AGENT_ID = cfg.agentId || defaultAgentId();

  env.CONSENSUS_DEFAULT_POLICY = cfg.defaults.policy;
  env.CONSENSUS_DEFAULT_REWARD = String(cfg.defaults.reward);
  env.CONSENSUS_DEFAULT_STAKE = String(cfg.defaults.stake);
  env.CONSENSUS_DEFAULT_LEASE_SECONDS = String(cfg.defaults.leaseSeconds);

  if (cfg.activeBoard === 'remote') {
    env.CONSENSUS_URL = cfg.boards.remote.url;
    env.CONSENSUS_BOARD_ID = cfg.boards.remote.boardId;
    env.CONSENSUS_API_KEY_ENV = cfg.boards.remote.auth.apiKeyEnv || 'CONSENSUS_API_KEY';
    env[env.CONSENSUS_API_KEY_ENV] = token;
  } else {
    env.CONSENSUS_ROOT = cfg.boards.local.root;
  }

  // Return a map with already-escaped values for direct file emission.
  const escaped: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) escaped[k] = shellEscape(v);
  return escaped;
}
