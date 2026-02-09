import { existsSync, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type ConsensusCliConfig = {
  agentId?: string;
  activeBoard: 'local' | 'remote';
  boards: {
    local: { type: 'local'; root: string; jobsPath: string; ledgerPath: string };
    remote: { type: 'remote'; url: string; boardId: string; auth: { type: 'apiKey'; apiKeyEnv: string } };
  };
  defaults: { policy: string; reward: number; stake: number; leaseSeconds: number };
};

export const defaultConsensusCliConfig: ConsensusCliConfig = {
  activeBoard: 'remote',
  boards: {
    local: {
      type: 'local',
      root: '~/.openclaw/workplace/consensus-board',
      jobsPath: 'jobs',
      ledgerPath: 'ledger.json'
    },
    remote: {
      type: 'remote',
      url: 'https://api.consensus.tools',
      boardId: 'board_all',
      auth: { type: 'apiKey', apiKeyEnv: 'CONSENSUS_API_KEY' }
    }
  },
  defaults: {
    policy: 'HIGHEST_CONFIDENCE_SINGLE',
    reward: 8,
    stake: 4,
    leaseSeconds: 180
  }
};

export function expandHome(input: string): string {
  if (!input.startsWith('~')) return input;
  return path.join(os.homedir(), input.slice(1));
}

export function resolveCliConfigPath(cwd: string = process.cwd()): string {
  const envPath = process.env.CONSENSUS_CONFIG;
  if (envPath) return expandHome(envPath);

  const local = path.join(cwd, '.consensus', 'config.json');
  if (existsSync(local)) return local;

  return path.join(os.homedir(), '.consensus', 'config.json');
}

export async function loadCliConfig(cwd: string = process.cwd()): Promise<ConsensusCliConfig> {
  const filePath = resolveCliConfigPath(cwd);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as ConsensusCliConfig;
  } catch {
    return JSON.parse(JSON.stringify(defaultConsensusCliConfig)) as ConsensusCliConfig;
  }
}

export async function saveCliConfig(config: ConsensusCliConfig, cwd: string = process.cwd()): Promise<void> {
  const filePath = resolveCliConfigPath(cwd);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8');
}

export function getConfigValue(config: any, key: string): any {
  return key.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), config);
}

export function setConfigValue(config: any, key: string, value: any): void {
  const parts = key.split('.');
  let cur = config as any;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cur[parts[i]]) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

export function parseValue(input: string): any {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

export function resolveRemoteBaseUrl(remoteUrl: string, boardId: string): string {
  const trimmed = remoteUrl.replace(/\/$/, '');
  if (trimmed.includes('/v1/boards/')) return trimmed;
  return `${trimmed}/v1/boards/${boardId}`;
}

