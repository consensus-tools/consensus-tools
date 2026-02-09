import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ConsensusToolsBackendCli } from './cli';
import { initRepo } from './cli';
import {
  getConfigValue,
  loadCliConfig,
  parseValue,
  resolveRemoteBaseUrl,
  saveCliConfig,
  setConfigValue
} from './cliConfig';
import type { ConsensusCliConfig } from './cliConfig';
import { ConsensusToolsClient } from './network/client';
import { renderTable } from './util/table';
import { runConsensusPolicyTests } from './testing/consensusTestRunner';

type Parsed = { positionals: string[]; options: Record<string, any> };

function output(data: any, json: boolean) {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (typeof data === 'string') {
    console.log(data);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

async function readStdinIfAny(): Promise<string | undefined> {
  if (process.stdin.isTTY) return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text || undefined;
}

function resolveAgentId(cfg: ConsensusCliConfig): string {
  const fromEnv = process.env.CONSENSUS_AGENT_ID;
  if (fromEnv) return fromEnv;
  if (cfg.agentId) return cfg.agentId;

  let user = 'cli';
  try {
    const u = os.userInfo();
    if (u?.username) user = u.username;
  } catch {
    // ignore
  }
  return `${user}@${os.hostname()}`;
}

function createRemoteClient(cfg: ConsensusCliConfig): ConsensusToolsClient {
  const baseUrl = resolveRemoteBaseUrl(cfg.boards.remote.url, cfg.boards.remote.boardId);
  const envName = cfg.boards.remote.auth.apiKeyEnv || 'CONSENSUS_API_KEY';
  const token = process.env[envName] || '';
  if (!token) {
    throw new Error(`Missing access token. Set ${envName} (or run consensus-tools init).`);
  }
  return new ConsensusToolsClient(baseUrl, token);
}

function createBackend(cfg: ConsensusCliConfig): ConsensusToolsBackendCli {
  const requireRemote = () => {
    if (cfg.activeBoard !== 'remote') {
      throw new Error('Local mode via consensus-tools CLI is not supported yet. Use `.consensus/api/*.sh` or switch to remote.');
    }
    return createRemoteClient(cfg);
  };

  return {
    postJob: async (agentId, input) => requireRemote().postJob(agentId, input),
    listJobs: async (filters) => requireRemote().listJobs(filters || {}),
    getJob: async (jobId) => requireRemote().getJob(jobId),
    getStatus: async (jobId) => requireRemote().getStatus(jobId),
    submitJob: async (agentId, jobId, input) => requireRemote().submitJob(agentId, jobId, input),
    listSubmissions: async (jobId) => {
      const status = await requireRemote().getStatus(jobId);
      return status?.submissions || [];
    },
    listVotes: async (jobId) => {
      const status = await requireRemote().getStatus(jobId);
      return status?.votes || [];
    },
    vote: async (agentId, jobId, input) => requireRemote().vote(agentId, jobId, input),
    resolveJob: async (agentId, jobId, input) => requireRemote().resolveJob(agentId, jobId, input)
  };
}

function parseArgs(args: string[]): Parsed {
  const options: Record<string, any> = {};
  const positionals: string[] = [];

  const takeValue = (i: number) => {
    if (i + 1 >= args.length) throw new Error(`Missing value for ${args[i]}`);
    return args[i + 1];
  };

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = (eq >= 0 ? a.slice(2, eq) : a.slice(2)).trim();
      const value = eq >= 0 ? a.slice(eq + 1) : undefined;

      if (!key) continue;

      // boolean flags
      if (value === undefined && (i + 1 >= args.length || args[i + 1].startsWith('-'))) {
        options[key] = true;
        continue;
      }

      const raw = value ?? takeValue(i);
      if (value === undefined) i += 1;

      // collect repeatables
      if (key === 'winner') {
        (options.winner ||= []).push(raw);
      } else {
        options[key] = raw;
      }
      continue;
    }
    if (a === '-h' || a === '--help') {
      options.help = true;
      continue;
    }
    if (a === '-v' || a === '--version') {
      options.version = true;
      continue;
    }
    positionals.push(a);
  }

  return { positionals, options };
}

function helpText() {
  return [
    'consensus-tools',
    '',
    'Usage:',
    '  consensus-tools <command> [subcommand] [options]',
    '',
    'Commands:',
    '  init [--force] [--wizard] [--templates-only]',
    '  config get <key>',
    '  config set <key> <value>',
    '  board use <local|remote> [url]',
    '  jobs post --title <title> [--desc <desc>] [--input <input>] [--mode SUBMISSION|VOTING] [--policy <key>] [--reward <n>] [--stake <n>] [--expires <seconds>] [--json]',
    '  jobs get <jobId> [--json]',
    '  jobs list [--tag <tag>] [--status <status>] [--mine] [--json]',
    '  submissions create <jobId> --artifact <json> [--summary <text>] [--confidence <n>] [--json]',
    '  submissions list <jobId> [--json]',
    '  votes cast <jobId> [--submission <id> | --choice <key>] [--weight <n>] [--json]',
    '  votes list <jobId> [--json]',
    '  resolve <jobId> [--winner <agentId> ...] [--submission <submissionId>] [--json]',
    '  result get <jobId> [--json]',
    '  tests run [--agents <n>] [--script <path>] [--openai-key <key>] [--model <name>]',
    '',
    'Notes:',
    '  - Hosted boards require an access token via env (default CONSENSUS_API_KEY).',
    '  - For OpenClaw integration: openclaw consensus <...>',
    ''
  ].join('\n');
}

async function readPackageVersion(): Promise<string> {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(here, '..', 'package.json');
    const raw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const parsed = parseArgs(argv);

  if (parsed.options.version) {
    console.log(await readPackageVersion());
    return;
  }

  const [cmd, sub, ...restPos] = parsed.positionals;
  if (!cmd || parsed.options.help) {
    console.log(helpText());
    return;
  }

  if (cmd === 'init') {
    await initRepo({
      rootDir: process.cwd(),
      force: Boolean(parsed.options.force),
      wizard: typeof parsed.options.wizard === 'boolean' ? Boolean(parsed.options.wizard) : undefined,
      templatesOnly: Boolean(parsed.options['templates-only'] || parsed.options.templatesOnly)
    });
    console.log('Created .consensus templates.');
    return;
  }

  if (cmd === 'config') {
    if (sub !== 'get' && sub !== 'set') throw new Error('Usage: consensus-tools config get <key> | set <key> <value>');
    const [key, value] = restPos;
    if (!key) throw new Error('Missing key');
    if (sub === 'get') {
      const cfg = await loadCliConfig();
      output(getConfigValue(cfg, key) ?? null, true);
      return;
    }
    if (value === undefined) throw new Error('Missing value');
    const cfg = await loadCliConfig();
    setConfigValue(cfg, key, parseValue(value));
    await saveCliConfig(cfg);
    output({ ok: true }, true);
    return;
  }

  if (cmd === 'board') {
    if (sub !== 'use') throw new Error('Usage: consensus-tools board use <local|remote> [url]');
    const [type, url] = restPos;
    if (type !== 'local' && type !== 'remote') throw new Error('board type must be local or remote');
    const cfg = await loadCliConfig();
    cfg.activeBoard = type;
    if (type === 'remote' && url) cfg.boards.remote.url = url;
    await saveCliConfig(cfg);
    output({ activeBoard: cfg.activeBoard, url: cfg.boards.remote.url }, true);
    return;
  }

  // Everything below needs backend + agentId.
  const cfg = await loadCliConfig();
  const agentId = resolveAgentId(cfg);
  const backend = createBackend(cfg);

  if (cmd === 'jobs') {
    if (sub === 'post') {
      if (!parsed.options.title) throw new Error('Missing required option: --title');
      const input = (parsed.options.input as string | undefined) ?? (await readStdinIfAny());
      const job = await backend.postJob(agentId, {
        title: String(parsed.options.title),
        desc: parsed.options.desc,
        description: parsed.options.desc,
        inputRef: input,
        mode: parsed.options.mode,
        policyKey: parsed.options.policy,
        rewardAmount: parsed.options.reward ? Number(parsed.options.reward) : undefined,
        stakeAmount: parsed.options.stake ? Number(parsed.options.stake) : undefined,
        reward: parsed.options.reward ? Number(parsed.options.reward) : undefined,
        stakeRequired: parsed.options.stake ? Number(parsed.options.stake) : undefined,
        expiresSeconds: parsed.options.expires ? Number.parseInt(String(parsed.options.expires), 10) : undefined
      });
      output(job, Boolean(parsed.options.json));
      return;
    }
    if (sub === 'get') {
      const [jobId] = restPos;
      if (!jobId) throw new Error('Missing jobId');
      const job = await backend.getJob(jobId);
      if (!job) throw new Error('Job not found');
      output(job, Boolean(parsed.options.json));
      return;
    }
    if (sub === 'list') {
      const list = await backend.listJobs({
        tag: parsed.options.tag,
        status: parsed.options.status,
        mine: parsed.options.mine ? agentId : undefined
      });
      if (parsed.options.json) {
        output(list, true);
        return;
      }
      const table = renderTable(
        list.map((job) => ({
          id: job.id,
          title: job.title,
          mode: job.mode ?? 'SUBMISSION',
          status: job.status,
          reward: (job as any).rewardAmount ?? (job as any).reward,
          closes: (job as any).closesAt ?? (job as any).expiresAt
        })),
        [
          { key: 'id', label: 'ID' },
          { key: 'title', label: 'Title' },
          { key: 'mode', label: 'Mode' },
          { key: 'status', label: 'Status' },
          { key: 'reward', label: 'Reward', align: 'right' },
          { key: 'closes', label: 'Closes' }
        ]
      );
      console.log(table);
      return;
    }
    throw new Error('Usage: consensus-tools jobs <post|get|list> ...');
  }

  if (cmd === 'submissions') {
    if (sub === 'create') {
      const [jobId] = restPos;
      if (!jobId) throw new Error('Missing jobId');
      if (!parsed.options.artifact) throw new Error('Missing required option: --artifact <json>');
      const artifacts = JSON.parse(String(parsed.options.artifact));
      const submission = await backend.submitJob(agentId, jobId, {
        summary: String(parsed.options.summary ?? ''),
        artifacts,
        confidence: parsed.options.confidence ? Number(parsed.options.confidence) : 0.5
      });
      output(submission, Boolean(parsed.options.json));
      return;
    }
    if (sub === 'list') {
      const [jobId] = restPos;
      if (!jobId) throw new Error('Missing jobId');
      const list = await backend.listSubmissions(jobId);
      output(list, Boolean(parsed.options.json));
      return;
    }
    throw new Error('Usage: consensus-tools submissions <create|list> ...');
  }

  if (cmd === 'votes') {
    if (sub === 'cast') {
      const [jobId] = restPos;
      if (!jobId) throw new Error('Missing jobId');
      const submissionId = parsed.options.submission as string | undefined;
      const choiceKey = parsed.options.choice as string | undefined;
      const weight = parsed.options.weight ? Number(parsed.options.weight) : 1;
      const vote = await backend.vote(agentId, jobId, {
        submissionId,
        choiceKey,
        targetType: submissionId ? 'SUBMISSION' : choiceKey ? 'CHOICE' : undefined,
        targetId: submissionId ?? choiceKey,
        weight,
        score: weight
      });
      output(vote, Boolean(parsed.options.json));
      return;
    }
    if (sub === 'list') {
      const [jobId] = restPos;
      if (!jobId) throw new Error('Missing jobId');
      const list = await backend.listVotes(jobId);
      output(list, Boolean(parsed.options.json));
      return;
    }
    throw new Error('Usage: consensus-tools votes <cast|list> ...');
  }

  if (cmd === 'resolve') {
    const jobId = sub;
    if (!jobId) throw new Error('Missing jobId');
    const winners = (parsed.options.winner as string[] | undefined) || [];
    const resolution = await backend.resolveJob(agentId, jobId, {
      manualWinners: winners.length ? winners : undefined,
      manualSubmissionId: parsed.options.submission
    });
    output(resolution, Boolean(parsed.options.json));
    return;
  }

  if (cmd === 'result') {
    if (sub !== 'get') throw new Error('Usage: consensus-tools result get <jobId>');
    const [jobId] = restPos;
    if (!jobId) throw new Error('Missing jobId');
    const status = backend.getStatus ? await backend.getStatus(jobId) : await backend.getJob(jobId);
    output(status, Boolean(parsed.options.json));
    return;
  }

  if (cmd === 'tests') {
    if (sub !== 'run') throw new Error('Usage: consensus-tools tests run [--agents N] [--script PATH] ...');
    const agentCount = parsed.options.agents ? Number(parsed.options.agents) : 3;
    const scriptPath = String(parsed.options.script || '.consensus/generation.ts');
    const apiKey = (parsed.options['openai-key'] as string | undefined) || process.env.OPENAI_API_KEY;
    const model = String(parsed.options.model || 'gpt-5.2');
    const result = await runConsensusPolicyTests({
      scriptPath,
      agentCount,
      apiKey: apiKey || undefined,
      model
    });
    output(result, true);
    return;
  }

  throw new Error(`Unknown command: ${cmd}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exitCode = 1;
});
