import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ConsensusToolsConfig, Job } from './types';
import { renderTable } from './util/table';
import { runConsensusPolicyTests } from './testing/consensusTestRunner';
import { runInitWizard } from './initWizard';
import {
  defaultConsensusCliConfig,
  getConfigValue,
  loadCliConfig,
  parseValue,
  saveCliConfig,
  setConfigValue,
  type ConsensusCliConfig
} from './cliConfig';

export interface ConsensusToolsBackendCli {
  postJob(agentId: string, input: any): Promise<Job>;
  listJobs(filters?: Record<string, string | undefined>): Promise<Job[]>;
  getJob(jobId: string): Promise<Job | undefined>;
  getStatus?(jobId: string): Promise<any>;
  submitJob(agentId: string, jobId: string, input: any): Promise<any>;
  listSubmissions(jobId: string): Promise<any[]>;
  listVotes(jobId: string): Promise<any[]>;
  vote(agentId: string, jobId: string, input: any): Promise<any>;
  resolveJob(agentId: string, jobId: string, input: any): Promise<any>;
}

export async function initRepo(opts: {
  rootDir?: string;
  force?: boolean;
  wizard?: boolean;
  templatesOnly?: boolean;
}): Promise<void> {
  const rootDir = opts.rootDir || process.cwd();
  const force = Boolean(opts.force);
  const templatesOnly = Boolean(opts.templatesOnly);
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const wizard = typeof opts.wizard === 'boolean' ? opts.wizard : interactive;

  if (templatesOnly || !wizard) {
    await writeInitTemplates(rootDir, force, defaultConsensusCliConfig);
    return;
  }

  if (!interactive) {
    throw new Error('init wizard requires a TTY. Re-run with --templates-only.');
  }

  const result = await runInitWizard(rootDir);
  await writeInitTemplates(rootDir, force, result.config);
  if (result.env) {
    await writeEnvFile(rootDir, force, result.env);
  }
}

export function registerCli(program: any, backend: ConsensusToolsBackendCli, config: ConsensusToolsConfig, agentId: string) {
  const consensus = program.command('consensus').description('Consensus tools');
  registerConsensusSubcommands(consensus, backend, config, agentId);
}

export function registerStandaloneCli(
  program: any,
  backend: ConsensusToolsBackendCli,
  config: ConsensusToolsConfig,
  agentId: string
) {
  registerConsensusSubcommands(program, backend, config, agentId);
}

function registerConsensusSubcommands(
  consensus: any,
  backend: ConsensusToolsBackendCli,
  _config: ConsensusToolsConfig,
  agentId: string
) {
  consensus
    .command('init')
    .description('Initialize consensus-tools in this repo (.consensus/)')
    .option('--force', 'Overwrite existing files')
    .option('--wizard', 'Run an interactive wizard (default when TTY)')
    .option('--templates-only', 'Only generate templates; skip prompts')
    .action(async (opts: any) => {
      await initRepo({
        rootDir: process.cwd(),
        force: Boolean(opts.force),
        wizard: typeof opts.wizard === 'boolean' ? opts.wizard : undefined,
        templatesOnly: Boolean(opts.templatesOnly)
      });
      console.log('Created .consensus templates.');
    });

  const configCmd = consensus.command('config').description('Manage config');
  configCmd
    .command('get <key>')
    .description('Get a config value')
    .action(async (key: string) => {
      const cfg = await loadCliConfig();
      const value = getConfigValue(cfg, key);
      output(value ?? null, true);
    });

  configCmd
    .command('set <key> <value>')
    .description('Set a config value')
    .action(async (key: string, value: string) => {
      const cfg = await loadCliConfig();
      const parsed = parseValue(value);
      setConfigValue(cfg, key, parsed);
      await saveCliConfig(cfg);
      output({ ok: true }, true);
    });

  const board = consensus.command('board').description('Manage active board');
  board
    .command('use <type> [url]')
    .description('Select local or remote board')
    .action(async (type: string, url?: string) => {
      const cfg = await loadCliConfig();
      if (type !== 'local' && type !== 'remote') {
        throw new Error('board type must be local or remote');
      }
      cfg.activeBoard = type;
      if (type === 'remote' && url) {
        cfg.boards.remote.url = url;
      }
      await saveCliConfig(cfg);
      output({ activeBoard: cfg.activeBoard, url: cfg.boards.remote.url }, true);
    });

  const jobs = consensus.command('jobs').description('Manage jobs');
  jobs
    .command('post')
    .description('Post a new job')
    .requiredOption('--title <title>', 'Job title')
    .option('--desc <desc>', 'Job description')
    .option('--input <input>', 'Job input (string)')
    .option('--mode <mode>', 'Job mode (SUBMISSION or VOTING)')
    .option('--policy <policy>', 'Policy key')
    .option('--reward <n>', 'Reward amount', parseFloat)
    .option('--stake <n>', 'Stake amount', parseFloat)
    .option('--expires <seconds>', 'Expires seconds', parseInt)
    .option('--json', 'JSON output')
    .action(async (opts: any) => {
      const input = opts.input ?? (await readStdinIfAny());
      const job = await backend.postJob(agentId, {
        title: opts.title,
        desc: opts.desc,
        description: opts.desc,
        inputRef: input,
        mode: opts.mode,
        policyKey: opts.policy,
        rewardAmount: opts.reward,
        stakeAmount: opts.stake,
        reward: opts.reward,
        stakeRequired: opts.stake,
        expiresSeconds: opts.expires
      });
      output(job, opts.json);
    });

  jobs
    .command('get <jobId>')
    .description('Get a job')
    .option('--json', 'JSON output')
    .action(async (jobId: string, opts: any) => {
      const job = await backend.getJob(jobId);
      if (!job) throw new Error('Job not found');
      output(job, opts.json);
    });

  jobs
    .command('list')
    .description('List jobs')
    .option('--tag <tag>', 'Filter by tag')
    .option('--status <status>', 'Filter by status')
    .option('--mine', 'Only jobs created by current agent')
    .option('--json', 'JSON output')
    .action(async (opts: any) => {
      const list = await backend.listJobs({
        tag: opts.tag,
        status: opts.status,
        mine: opts.mine ? agentId : undefined
      });
      if (opts.json) return output(list, true);
      const table = renderTable(
        list.map((job) => ({
          id: job.id,
          title: job.title,
          mode: job.mode ?? 'SUBMISSION',
          status: job.status,
          reward: job.rewardAmount ?? job.reward,
          closes: job.closesAt ?? job.expiresAt
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
    });

  const submissions = consensus.command('submissions').description('Manage submissions');
  submissions
    .command('create <jobId>')
    .description('Create a submission')
    .requiredOption('--artifact <json>', 'Artifact JSON string')
    .option('--summary <summary>', 'Submission summary')
    .option('--confidence <n>', 'Confidence 0-1', parseFloat)
    .option('--json', 'JSON output')
    .action(async (jobId: string, opts: any) => {
      const artifacts = JSON.parse(opts.artifact);
      const submission = await backend.submitJob(agentId, jobId, {
        summary: opts.summary ?? '',
        artifacts,
        confidence: Number(opts.confidence ?? 0.5)
      });
      output(submission, opts.json);
    });

  submissions
    .command('list <jobId>')
    .description('List submissions')
    .option('--json', 'JSON output')
    .action(async (jobId: string, opts: any) => {
      const list = await backend.listSubmissions(jobId);
      output(list, opts.json);
    });

  const votes = consensus.command('votes').description('Manage votes');
  votes
    .command('cast <jobId>')
    .description('Cast a vote')
    .option('--submission <id>', 'Submission id to vote for')
    .option('--choice <key>', 'Choice key to vote for')
    .option('--yes', 'Approval vote: yes (+1)')
    .option('--no', 'Approval vote: no (-1)')
    .option('--weight <n>', 'Vote weight', parseFloat)
    .option('--stake <n>', 'Stake amount locked for this vote (staked settlement)', parseFloat)
    .option('--json', 'JSON output')
    .action(async (jobId: string, opts: any) => {
      const hasYesNo = Boolean(opts.yes || opts.no);
      const score = hasYesNo ? (opts.no ? -1 : 1) : (opts.weight ?? 1);

      const vote = await backend.vote(agentId, jobId, {
        submissionId: opts.submission,
        choiceKey: opts.choice,
        targetType: opts.submission ? 'SUBMISSION' : opts.choice ? 'CHOICE' : undefined,
        targetId: opts.submission ?? opts.choice,
        weight: opts.weight ?? (hasYesNo ? 1 : undefined),
        score,
        stakeAmount: opts.stake
      });
      output(vote, opts.json);
    });

  votes
    .command('list <jobId>')
    .description('List votes')
    .option('--json', 'JSON output')
    .action(async (jobId: string, opts: any) => {
      const list = await backend.listVotes(jobId);
      output(list, opts.json);
    });

  consensus
    .command('resolve <jobId>')
    .description('Resolve a job')
    .option('--winner <agentId>', 'Winner agent id (repeatable)', collect)
    .option('--submission <submissionId>', 'Winning submission id')
    .option('--json', 'JSON output')
    .action(async (jobId: string, opts: any) => {
      const resolution = await backend.resolveJob(agentId, jobId, {
        manualWinners: opts.winner,
        manualSubmissionId: opts.submission
      });
      output(resolution, opts.json);
    });

  const result = consensus.command('result').description('Read job result');
  result
    .command('get <jobId>')
    .description('Get job result')
    .option('--json', 'JSON output')
    .action(async (jobId: string, opts: any) => {
      const status = backend.getStatus ? await backend.getStatus(jobId) : await backend.getJob(jobId);
      output(status, opts.json);
    });

  const tests = consensus.command('tests').description('Run consensus policy tests');
  tests
    .command('run')
    .description('Run consensus policy tests with generation script')
    .option('--agents <n>', 'Number of agent personalities', parseInt)
    .option('--script <path>', 'Path to generation script', '.consensus/generation.ts')
    .option('--openai-key <key>', 'OpenAI API key (or set OPENAI_API_KEY)')
    .option('--model <name>', 'Model name', 'gpt-5.2')
    .action(async (opts: any) => {
      const apiKey = opts.openaiKey || process.env.OPENAI_API_KEY;
      const agentCount = Number(opts.agents || 3);
      const result = await runConsensusPolicyTests({
        scriptPath: opts.script,
        agentCount,
        apiKey: apiKey || undefined,
        model: opts.model
      });
      output(result, true);
    });
}

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

function collect(value: string, previous: string[] = []): string[] {
  return previous.concat([value]);
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

async function writeEnvFile(rootDir: string, force: boolean, env: Record<string, string>): Promise<void> {
  const filePath = path.join(rootDir, '.consensus', '.env');
  const lines = Object.entries(env).map(([k, v]) => `export ${k}=${v}`);
  const content = [...lines, ''].join('\n');
  await writeFile(filePath, content, force);
}

async function writeInitTemplates(rootDir: string, force: boolean, config: ConsensusCliConfig): Promise<void> {
  const baseDir = path.join(rootDir, '.consensus');
  const apiDir = path.join(baseDir, 'api');

  await fs.mkdir(apiDir, { recursive: true });

  const files: Array<{ path: string; content: string; executable?: boolean }> = [
    { path: path.join(baseDir, 'README.md'), content: consensusReadme() },
    { path: path.join(baseDir, 'env.example'), content: envExample(config) },
    { path: path.join(baseDir, '.gitignore'), content: ['.env', ''].join('\n') },
    { path: path.join(baseDir, 'config.json'), content: JSON.stringify(config, null, 2) },
    { path: path.join(baseDir, 'generation.ts'), content: generationScriptTemplate() },
    { path: path.join(apiDir, 'common.sh'), content: commonSh(), executable: true },
    { path: path.join(apiDir, 'jobs_post.sh'), content: jobsPostSh(), executable: true },
    { path: path.join(apiDir, 'jobs_get.sh'), content: jobsGetSh(), executable: true },
    { path: path.join(apiDir, 'jobs_list.sh'), content: jobsListSh(), executable: true },
    { path: path.join(apiDir, 'submissions_create.sh'), content: submissionsCreateSh(), executable: true },
    { path: path.join(apiDir, 'submissions_list.sh'), content: submissionsListSh(), executable: true },
    { path: path.join(apiDir, 'votes_cast.sh'), content: votesCastSh(), executable: true },
    { path: path.join(apiDir, 'votes_list.sh'), content: votesListSh(), executable: true },
    { path: path.join(apiDir, 'resolve.sh'), content: resolveSh(), executable: true },
    { path: path.join(apiDir, 'result_get.sh'), content: resultGetSh(), executable: true }
  ];

  for (const file of files) {
    await writeFile(file.path, file.content, force);
    if (file.executable) {
      await fs.chmod(file.path, 0o755);
    }
  }
}

async function writeFile(filePath: string, content: string, force: boolean): Promise<void> {
  try {
    await fs.access(filePath);
    if (!force) return;
  } catch {
    // not found
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

function consensusReadme(): string {
  return [
    '# consensus.tools shell templates',
    '',
    'This folder is generated by `consensus-tools init` (or `openclaw consensus init`).',
    '',
    '## Quick start',
    '',
    '1) Copy and edit env vars:',
    '',
    '```bash',
    'cp .consensus/env.example .consensus/.env',
    '# edit .consensus/.env',
    'source .consensus/.env',
    '```',
    '',
    'Try local mode:',
    '',
    '```bash',
    'export CONSENSUS_MODE=local',
    'bash .consensus/api/jobs_post.sh "Test job" "desc" "hello world"',
    '```',
    '',
    'Switch to remote mode:',
    '',
    '```bash',
    'export CONSENSUS_MODE=remote',
    'export CONSENSUS_URL="https://api.consensus.tools"',
    'export CONSENSUS_BOARD_ID="board_..."',
    'export CONSENSUS_API_KEY="..."',
    'bash .consensus/api/jobs_post.sh "Title" "Desc" "Input"',
    '```',
    '',
    'Try the CLI:',
    '',
    '```bash',
    'consensus-tools jobs list',
    'consensus-tools jobs post --title "Hello" --desc "World" --input "Test"',
    '```',
    '',
    'Notes',
    '',
    'Local mode writes to CONSENSUS_ROOT (defaults in env.example).',
    '',
    'Remote mode hits ${CONSENSUS_URL}/v1/boards/${CONSENSUS_BOARD_ID}/...',
    '',
    'These scripts are intentionally readable and easy to customize.',
    ''
  ].join('\n');
}

function envExample(config: ConsensusCliConfig): string {
  const apiKeyEnv = config.boards.remote.auth.apiKeyEnv || 'CONSENSUS_API_KEY';
  return [
    '# Mode: "local" or "remote"',
    `export CONSENSUS_MODE=${config.activeBoard === 'remote' ? 'remote' : 'local'}`,
    '',
    '# Agent id (used by the CLI; optional)',
    'export CONSENSUS_AGENT_ID="cli@your-machine"',
    '',
    '# Local board root (JSON filesystem board)',
    `export CONSENSUS_ROOT="${config.boards.local.root}"`,
    '',
    '# Remote board settings',
    `export CONSENSUS_URL="${config.boards.remote.url}"`,
    `export CONSENSUS_BOARD_ID="${config.boards.remote.boardId}"`,
    `export CONSENSUS_API_KEY_ENV="${apiKeyEnv}"`,
    `export ${apiKeyEnv}="replace_me"`,
    '',
    '# Defaults (used by jobs_post.sh if not provided)',
    `export CONSENSUS_DEFAULT_POLICY="${config.defaults.policy}"`,
    `export CONSENSUS_DEFAULT_REWARD="${config.defaults.reward}"`,
    `export CONSENSUS_DEFAULT_STAKE="${config.defaults.stake}"`,
    `export CONSENSUS_DEFAULT_LEASE_SECONDS="${config.defaults.leaseSeconds}"`,
    ''
  ].join('\n');
}

function generationScriptTemplate(): string {
  return [
    '// Generated by consensus-tools init.',
    '// Customize this file, then run:',
    '//   consensus-tools tests run --agents 6 --script .consensus/generation.ts',
    '',
    '/**',
    ' * This script is intentionally deterministic by default (mockResponse).',
    ' * If you provide OPENAI_API_KEY (or --openai-key), the runner will call OpenAI.',
    ' */',
    'const script = {',
    "  name: 'rx_negation_demo',",
    '  task: {',
    "    title: 'Negation test: prescription advancement',",
    "    desc: 'Tell us why this insulin amount is NOT enough based on patient file, insurance reqs, and doctor notes.',",
    '    input: [',
    "      'We want to negation test prescription advancement for diabetic patients.',",
    "      'Explain why the insulin amount is not enough based on:',",
    "      '- patient file',",
    "      '- insurance info/requirements',",
    "      '- doctor notes',",
    "      '',",
    "      'Patient file: (paste here)',",
    "      '',",
    "      'Insurance info/requirements: (paste here)',",
    "      '',",
    "      'Doctor notes: (paste here)'",
    '    ].join(\"\\n\")',
    '  },',
    "  expectedAnswer: 'INSUFFICIENT',",
    '  personas: [],',
    '  getPersonas(count) {',
    '    const n = Math.max(3, Number(count || 3));',
    '    const third = Math.ceil(n / 3);',
    '',
    '    const mk = (role, i, systemPrompt, personaRole) => ({',
    "      id: `${role}_${i + 1}`,",
    "      name: `${role.toUpperCase()} Agent ${i + 1}`,",
    '      systemPrompt,',
    '      role: personaRole',
    '    });',
    '',
    '    const doctors = Array.from({ length: third }, (_, i) =>',
    '      mk(',
    "        'doctor',",
    '        i,',
    "        'You are a practicing clinician. Be precise. Use only the provided case context. Focus on medical necessity.',",
    "        'accurate'",
    '      )',
    '    );',
    '    const support = Array.from({ length: third }, (_, i) =>',
    '      mk(',
    "        'support',",
    '        i,',
    "        'You are customer support at a pharmacy benefits manager. Focus on process, eligibility, required docs, and next steps.',",
    "        'accurate'",
    '      )',
    '    );',
    '    const insurance = Array.from({ length: n - 2 * third }, (_, i) =>',
    '      mk(',
    "        'insurance',",
    '        i,',
    "        'You are an insurance reviewer. Apply coverage criteria and utilization management rules. Be skeptical and cite requirements.',",
    // Make the last insurance persona contrarian to ensure policies see disagreement.
    "        i === (n - 2 * third) - 1 ? 'contrarian' : 'accurate'",
    '      )',
    '    );',
    '',
    '    return [...doctors, ...support, ...insurance].slice(0, n);',
    '  },',
    '  buildPrompt(persona, task, expectedAnswer) {',
    '    return {',
    '      system: persona.systemPrompt,',
    '      user: [',
    "        'Return JSON: {\"answer\": string, \"confidence\": number, \"evidence\": string[]}',",
    "        '',",
    "        `TASK: ${task.title}`,",
    "        task.desc ? `DESC: ${task.desc}` : '',",
    "        '',",
    "        `INPUT:\\n${task.input}`,",
    "        '',",
    "        `EXPECTED (for negation testing): ${expectedAnswer}`",
    '      ].filter(Boolean).join(\"\\n\")',
    '    };',
    '  },',
    '  mockResponse(persona, task, expectedAnswer) {',
    '    const answer = persona.role === \"contrarian\" ? \"SUFFICIENT\" : expectedAnswer;',
    '    return JSON.stringify({',
    '      answer,',
    '      confidence: persona.role === \"contrarian\" ? 0.2 : 0.9,',
    '      evidence: [persona.name, task.title]',
    '    });',
    '  }',
    '};',
    '',
    'export default script;',
    ''
  ].join('\n');
}

function commonSh(): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '',
    '# --------- helpers ----------',
    'now_iso() { date -Iseconds; }',
    '',
    'require_env() {',
    '  local name="$1"',
    '  if [[ -z "${!name:-}" ]]; then',
    '    echo "Missing required env var: $name" >&2',
    '    exit 2',
    '  fi',
    '}',
    '',
    'mode() { echo "${CONSENSUS_MODE:-local}"; }',
    '',
    'local_root() {',
    '  require_env "CONSENSUS_ROOT"',
    '  echo "$CONSENSUS_ROOT"',
    '}',
    '',
    'local_state_file() {',
    '  # Engine-parity local state file (JsonStorage)',
    '  if [[ -n "${CONSENSUS_STATE_FILE:-}" ]]; then',
    '    echo "${CONSENSUS_STATE_FILE}"',
    '  else',
    '    echo "$(local_root)/state.json"',
    '  fi',
    '}',
    '',
    '',
    'ensure_local_board() {',
    '  local root; root="$(local_root)"',
    '  mkdir -p "$root/jobs"',
    '  [[ -f "$root/ledger.json" ]] || echo "[]" > "$root/ledger.json"',
    '}',
    '',
    'rand_id() {',
    '  # readable ids; good enough for local / scripting',
    '  echo "${1}_$(date +%s)_$RANDOM"',
    '}',
    '',
    'json_escape() {',
    '  # Safely JSON-escape an arbitrary string.',
    '  # Requires python3 (common on dev machines).',
    '  python3 - <<\'PY\' "$1"',
    'import json,sys',
    'print(json.dumps(sys.argv[1]))',
    'PY',
    '}',
    '',
    '# --------- remote request ----------',
    'remote_base() {',
    '  require_env "CONSENSUS_URL"',
    '  require_env "CONSENSUS_BOARD_ID"',
    '  echo "${CONSENSUS_URL%/}/v1/boards/${CONSENSUS_BOARD_ID}"',
    '}',
    '',
    'api_key_env() {',
    '  echo "${CONSENSUS_API_KEY_ENV:-CONSENSUS_API_KEY}"',
    '}',
    '',
    'remote_auth_header() {',
    '  local name; name="$(api_key_env)"',
    '  require_env "$name"',
    '  echo "Authorization: Bearer ${!name}"',
    '}',
    '',
    'curl_json() {',
    '  # curl_json METHOD URL JSON_BODY',
    '  local method="$1"',
    '  local url="$2"',
    '  local body="$3"',
    '',
    '  curl -sS -X "$method" "$url" \\',
    '    -H "$(remote_auth_header)" \\',
    '    -H "Content-Type: application/json" \\',
    '    -d "$body"',
    '}',
    '',
    '# --------- local IO ----------',
    'job_file() {',
    '  local root; root="$(local_root)"',
    '  echo "$root/jobs/${1}.json"',
    '}',
    '',
    'job_dir() {',
    '  local root; root="$(local_root)"',
    '  echo "$root/jobs/${1}"',
    '}',
    '',
    'ensure_job_dir() {',
    '  local d; d="$(job_dir "$1")"',
    '  mkdir -p "$d/submissions" "$d/votes"',
    '}',
    '',
    'write_json_file() {',
    '  local path="$1"',
    '  local contents="$2"',
    '  mkdir -p "$(dirname "$path")"',
    '  printf "%s\\n" "$contents" > "$path"',
    '}',
    '',
    'read_json_file() {',
    '  local path="$1"',
    '  if [[ ! -f "$path" ]]; then',
    '    echo "Not found: $path" >&2',
    '    exit 1',
    '  fi',
    '  cat "$path"',
    '}',
    ''
  ].join('\n');
}

function jobsPostSh(): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'source "$(dirname "$0")/common.sh"',
    '',
    'TITLE="${1:-}"',
    'DESC="${2:-}"',
    'INPUT="${3:-}"',
    '',
    'if [[ -z "$TITLE" ]]; then',
    '  echo "Usage: jobs_post.sh <title> [desc] [input]" >&2',
    '  exit 2',
    'fi',
    '',
    'POLICY="${CONSENSUS_DEFAULT_POLICY:-HIGHEST_CONFIDENCE_SINGLE}"',
    'REWARD="${CONSENSUS_DEFAULT_REWARD:-8}"',
    'STAKE_REQUIRED="${CONSENSUS_DEFAULT_STAKE:-4}"',
    'EXPIRES_SECONDS="${CONSENSUS_DEFAULT_EXPIRES_SECONDS:-86400}"',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  state_file="$(local_state_file)"',
    '  node --import tsx --input-type=module - "$state_file" "$TITLE" "$DESC" "$INPUT" "$POLICY" "$REWARD" "$STAKE_REQUIRED" "$EXPIRES_SECONDS" <<\'NODE\'',
    "import { JsonStorage } from '@consensus-tools/consensus-tools/src/storage/JsonStorage.ts';",
    "import { LedgerEngine } from '@consensus-tools/consensus-tools/src/ledger/ledger.ts';",
    "import { JobEngine } from '@consensus-tools/consensus-tools/src/jobs/engine.ts';",
    "import { defaultConfig } from '@consensus-tools/consensus-tools/src/config.ts';",
    'const [stateFile,title,desc,input,policy,reward,stake,expires]=process.argv.slice(2);',
    'const storage=new JsonStorage(stateFile); await storage.init();',
    'const ledger=new LedgerEngine(storage, defaultConfig);',
    'const engine=new JobEngine(storage, ledger, defaultConfig);',
    "const job = await engine.postJob('cli@local', {",
    '  title,',
    '  desc,',
    '  inputRef: input,',
    '  policyKey: policy,',
    '  rewardAmount: Number(reward),',
    '  reward: Number(reward),',
    '  stakeRequired: Number(stake),',
    '  stakeAmount: Number(stake),',
    '  expiresSeconds: Number(expires)',
    '});',
    'console.log(JSON.stringify(job, null, 2));',
    'NODE',
    '  exit 0',
    'fi',
    '',
    '# remote',
    'base="$(remote_base)"',
    'payload="$(cat <<JSON',
    '{',
    '  "title": "$TITLE",',
    '  "desc": "${DESC:-}",',
    '  "input": "${INPUT:-}",',
    '  "mode": "SUBMISSION",',
    '  "policyKey": "$POLICY",',
    '  "rewardAmount": $REWARD,',
    '  "stakeAmount": $STAKE_REQUIRED,',
    '  "leaseSeconds": ${CONSENSUS_DEFAULT_LEASE_SECONDS:-180}',
    '}',
    'JSON',
    ')"',
    'curl_json "POST" "$base/jobs" "$payload"',
    'echo',
  ].join('\n');
}

function jobsGetSh(): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'source "$(dirname "$0")/common.sh"',
    '',
    'JOB_ID="${1:-}"',
    'if [[ -z "$JOB_ID" ]]; then',
    '  echo "Usage: jobs_get.sh <jobId>" >&2',
    '  exit 2',
    'fi',
    '',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  state_file="$(local_state_file)"',
    '  node --import tsx --input-type=module - "$state_file" "$JOB_ID" <<\'NODE\'',
    "import { JsonStorage } from '@consensus-tools/consensus-tools/src/storage/JsonStorage.ts';",
    "import { LedgerEngine } from '@consensus-tools/consensus-tools/src/ledger/ledger.ts';",
    "import { JobEngine } from '@consensus-tools/consensus-tools/src/jobs/engine.ts';",
    "import { defaultConfig } from '@consensus-tools/consensus-tools/src/config.ts';",
    'const [stateFile, jobId] = process.argv.slice(2);',
    'const storage=new JsonStorage(stateFile); await storage.init();',
    'const ledger=new LedgerEngine(storage, defaultConfig);',
    'const engine=new JobEngine(storage, ledger, defaultConfig);',
    'const job = await engine.getJob(jobId);',
    "if (!job) { console.error('Job not found'); process.exit(1); }",
    'console.log(JSON.stringify(job, null, 2));',
    'NODE',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'curl -sS "$base/jobs/$JOB_ID" -H "$(remote_auth_header)"',
    'echo',
  ].join('\n');
}

function jobsListSh(): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'source "$(dirname "$0")/common.sh"',
    '',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  state_file="$(local_state_file)"',
    '  node --import tsx --input-type=module - "$state_file" <<\'NODE\'',
    "import { JsonStorage } from '@consensus-tools/consensus-tools/src/storage/JsonStorage.ts';",
    "import { LedgerEngine } from '@consensus-tools/consensus-tools/src/ledger/ledger.ts';",
    "import { JobEngine } from '@consensus-tools/consensus-tools/src/jobs/engine.ts';",
    "import { defaultConfig } from '@consensus-tools/consensus-tools/src/config.ts';",
    'const [stateFile]=process.argv.slice(2);',
    'const storage=new JsonStorage(stateFile); await storage.init();',
    'const ledger=new LedgerEngine(storage, defaultConfig);',
    'const engine=new JobEngine(storage, ledger, defaultConfig);',
    'const jobs = await engine.listJobs({});',
    'for (const j of jobs) console.log(j.id);',
    'NODE',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'QS="${1:-}"',
    'url="$base/jobs"',
    'if [[ -n "$QS" ]]; then',
    '  url="$url?$QS"',
    'fi',
    'curl -sS "$url" -H "$(remote_auth_header)"',
    'echo',
  ].join('\n');
}

function submissionsCreateSh(): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'source "$(dirname "$0")/common.sh"',
    '',
    'JOB_ID="${1:-}"',
    'ARTIFACT_JSON="${2:-}"',
    'SUMMARY="${3:-}"',
    'CONFIDENCE="${4:-0.5}"',
    '',
    'if [[ -z "$JOB_ID" || -z "$ARTIFACT_JSON" ]]; then',
    '  echo "Usage: submissions_create.sh <jobId> <artifact_json> [summary] [confidence]" >&2',
    '  exit 2',
    'fi',
    '',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  state_file="$(local_state_file)"',
    '  node --import tsx --input-type=module - "$state_file" "$JOB_ID" "$ARTIFACT_JSON" "${SUMMARY:-}" "$CONFIDENCE" <<\'NODE\'',
    "import { JsonStorage } from '@consensus-tools/consensus-tools/src/storage/JsonStorage.ts';",
    "import { LedgerEngine } from '@consensus-tools/consensus-tools/src/ledger/ledger.ts';",
    "import { JobEngine } from '@consensus-tools/consensus-tools/src/jobs/engine.ts';",
    "import { defaultConfig } from '@consensus-tools/consensus-tools/src/config.ts';",
    'const [stateFile, jobId, artifactJson, summary, conf] = process.argv.slice(2);',
    'const artifacts = JSON.parse(artifactJson);',
    'const storage=new JsonStorage(stateFile); await storage.init();',
    'const ledger=new LedgerEngine(storage, defaultConfig);',
    'const engine=new JobEngine(storage, ledger, defaultConfig);',
    "const sub = await engine.submitJob('cli@local', jobId, { summary: summary || '', artifacts, confidence: Number(conf) });",
    'console.log(JSON.stringify(sub, null, 2));',
    'NODE',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'payload="$(cat <<JSON',
    '{',
    '  "artifact": $ARTIFACT_JSON,',
    '  "summary": "${SUMMARY:-}"',
    '}',
    'JSON',
    ')"',
    'curl_json "POST" "$base/jobs/$JOB_ID/submissions" "$payload"',
    'echo',
  ].join('\n');
}

function submissionsListSh(): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'source "$(dirname "$0")/common.sh"',
    '',
    'JOB_ID="${1:-}"',
    'if [[ -z "$JOB_ID" ]]; then',
    '  echo "Usage: submissions_list.sh <jobId>" >&2',
    '  exit 2',
    'fi',
    '',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  state_file="$(local_state_file)"',
    '  node --import tsx --input-type=module - "$state_file" "$JOB_ID" <<\'NODE\'',
    "import { JsonStorage } from '@consensus-tools/consensus-tools/src/storage/JsonStorage.ts';",
    "import { LedgerEngine } from '@consensus-tools/consensus-tools/src/ledger/ledger.ts';",
    "import { JobEngine } from '@consensus-tools/consensus-tools/src/jobs/engine.ts';",
    "import { defaultConfig } from '@consensus-tools/consensus-tools/src/config.ts';",
    'const [stateFile, jobId] = process.argv.slice(2);',
    'const storage=new JsonStorage(stateFile); await storage.init();',
    'const ledger=new LedgerEngine(storage, defaultConfig);',
    'const engine=new JobEngine(storage, ledger, defaultConfig);',
    'const list = await engine.listSubmissions(jobId);',
    'for (const s of list) console.log(JSON.stringify(s, null, 2));',
    'NODE',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'curl -sS "$base/jobs/$JOB_ID/submissions" -H "$(remote_auth_header)"',
    'echo',
  ].join('\n');
}

function votesCastSh(): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'source "$(dirname "$0")/common.sh"',
    '',
    'JOB_ID="${1:-}"',
    'shift || true',
    'TARGET_TYPE=""',
    'TARGET_ID=""',
    'WEIGHT="1"',
    '',
    'if [[ "${1:-}" == "SUBMISSION" || "${1:-}" == "CHOICE" ]]; then',
    '  TARGET_TYPE="$1"; TARGET_ID="${2:-}"; WEIGHT="${3:-1}"',
    'else',
    '  while [[ $# -gt 0 ]]; do',
    '    case "$1" in',
    '      --submission) TARGET_TYPE="SUBMISSION"; TARGET_ID="${2:-}"; shift 2 ;;',
    '      --choice)     TARGET_TYPE="CHOICE"; TARGET_ID="${2:-}"; shift 2 ;;',
    '      --weight)     WEIGHT="${2:-1}"; shift 2 ;;',
    '      *) echo "Unknown arg: $1" >&2; exit 2 ;;',
    '    esac',
    '  done',
    'fi',
    '',
    'if [[ -z "$JOB_ID" || -z "$TARGET_TYPE" || -z "$TARGET_ID" ]]; then',
    '  echo "Usage: votes_cast.sh <jobId> SUBMISSION <submissionId> [weight]" >&2',
    '  echo "   or: votes_cast.sh <jobId> --submission <id> [--weight <n>]" >&2',
    '  exit 2',
    'fi',
    '',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  state_file="$(local_state_file)"',
    '  node --import tsx --input-type=module - "$state_file" "$JOB_ID" "$TARGET_TYPE" "$TARGET_ID" "$WEIGHT" <<\'NODE\'',
    "import { JsonStorage } from '@consensus-tools/consensus-tools/src/storage/JsonStorage.ts';",
    "import { LedgerEngine } from '@consensus-tools/consensus-tools/src/ledger/ledger.ts';",
    "import { JobEngine } from '@consensus-tools/consensus-tools/src/jobs/engine.ts';",
    "import { defaultConfig } from '@consensus-tools/consensus-tools/src/config.ts';",
    'const [stateFile, jobId, targetType, targetId, weight] = process.argv.slice(2);',
    'const storage=new JsonStorage(stateFile); await storage.init();',
    'const ledger=new LedgerEngine(storage, defaultConfig);',
    'const engine=new JobEngine(storage, ledger, defaultConfig);',
    "const vote = await engine.vote('cli@local', jobId, { targetType, targetId, submissionId: targetType==='SUBMISSION'?targetId:undefined, choiceKey: targetType==='CHOICE'?targetId:undefined, weight: Number(weight), score: Number(weight) });",
    'console.log(JSON.stringify(vote, null, 2));',
    'NODE',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'payload="$(cat <<JSON',
    '{',
    '  "targetType": "$TARGET_TYPE",',
    '  "targetId": "$TARGET_ID",',
    '  "weight": $WEIGHT',
    '}',
    'JSON',
    ')"',
    'curl_json "POST" "$base/jobs/$JOB_ID/votes" "$payload"',
    'echo',
  ].join('\n');
}

function votesListSh(): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'source "$(dirname "$0")/common.sh"',
    '',
    'JOB_ID="${1:-}"',
    'if [[ -z "$JOB_ID" ]]; then',
    '  echo "Usage: votes_list.sh <jobId>" >&2',
    '  exit 2',
    'fi',
    '',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  state_file="$(local_state_file)"',
    '  node --import tsx --input-type=module - "$state_file" "$JOB_ID" <<\'NODE\'',
    "import { JsonStorage } from '@consensus-tools/consensus-tools/src/storage/JsonStorage.ts';",
    "import { LedgerEngine } from '@consensus-tools/consensus-tools/src/ledger/ledger.ts';",
    "import { JobEngine } from '@consensus-tools/consensus-tools/src/jobs/engine.ts';",
    "import { defaultConfig } from '@consensus-tools/consensus-tools/src/config.ts';",
    'const [stateFile, jobId] = process.argv.slice(2);',
    'const storage=new JsonStorage(stateFile); await storage.init();',
    'const ledger=new LedgerEngine(storage, defaultConfig);',
    'const engine=new JobEngine(storage, ledger, defaultConfig);',
    'const list = await engine.listVotes(jobId);',
    'for (const v of list) console.log(JSON.stringify(v, null, 2));',
    'NODE',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'curl -sS "$base/jobs/$JOB_ID/votes" -H "$(remote_auth_header)"',
    'echo',
  ].join('\n');
}

function resolveSh(): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'source "$(dirname "$0")/common.sh"',
    '',
    'JOB_ID="${1:-}"',
    'shift || true',
    'MANUAL_WINNER=""',
    'MANUAL_SUB=""',
    '',
    'while [[ $# -gt 0 ]]; do',
    '  case "$1" in',
    '    --winner) MANUAL_WINNER="${2:-}"; shift 2 ;;',
    '    --submission) MANUAL_SUB="${2:-}"; shift 2 ;;',
    '    *) echo "Unknown arg: $1" >&2; exit 2 ;;',
    '  esac',
    'done',
    '',
    'if [[ -z "$JOB_ID" ]]; then',
    '  echo "Usage: resolve.sh <jobId> [--winner <agentId>] [--submission <submissionId>]" >&2',
    '  exit 2',
    'fi',
    '',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  state_file="$(local_state_file)"',
    '  node --import tsx --input-type=module - "$state_file" "$JOB_ID" "$MANUAL_WINNER" "$MANUAL_SUB" <<\'NODE\'',
    "import { JsonStorage } from '@consensus-tools/consensus-tools/src/storage/JsonStorage.ts';",
    "import { LedgerEngine } from '@consensus-tools/consensus-tools/src/ledger/ledger.ts';",
    "import { JobEngine } from '@consensus-tools/consensus-tools/src/jobs/engine.ts';",
    "import { defaultConfig } from '@consensus-tools/consensus-tools/src/config.ts';",
    'const [stateFile, jobId, winner, subId] = process.argv.slice(2);',
    'const storage=new JsonStorage(stateFile); await storage.init();',
    'const ledger=new LedgerEngine(storage, defaultConfig);',
    'const engine=new JobEngine(storage, ledger, defaultConfig);',
    'const input = {};',
    'if (winner) input.manualWinners = [winner];',
    'if (subId) input.manualSubmissionId = subId;',
    "const actor = winner || 'cli@local';",
    'const res = await engine.resolveJob(actor, jobId, input);',
    'console.log(JSON.stringify(res, null, 2));',
    'NODE',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'curl -sS -X POST "$base/jobs/$JOB_ID/resolve" -H "$(remote_auth_header)"',
    'echo',
  ].join('\n');
}

function resultGetSh(): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'source "$(dirname "$0")/common.sh"',
    '',
    'JOB_ID="${1:-}"',
    'if [[ -z "$JOB_ID" ]]; then',
    '  echo "Usage: result_get.sh <jobId>" >&2',
    '  exit 2',
    'fi',
    '',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  state_file="$(local_state_file)"',
    '  node --import tsx --input-type=module - "$state_file" "$JOB_ID" <<\'NODE\'',
    "import { JsonStorage } from '@consensus-tools/consensus-tools/src/storage/JsonStorage.ts';",
    "import { LedgerEngine } from '@consensus-tools/consensus-tools/src/ledger/ledger.ts';",
    "import { JobEngine } from '@consensus-tools/consensus-tools/src/jobs/engine.ts';",
    "import { defaultConfig } from '@consensus-tools/consensus-tools/src/config.ts';",
    'const [stateFile, jobId] = process.argv.slice(2);',
    'const storage=new JsonStorage(stateFile); await storage.init();',
    'const ledger=new LedgerEngine(storage, defaultConfig);',
    'const engine=new JobEngine(storage, ledger, defaultConfig);',
    'const status = await engine.getStatus(jobId);',
    'console.log(JSON.stringify(status.resolution ?? null, null, 2));',
    'NODE',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'curl -sS "$base/jobs/$JOB_ID/result" -H "$(remote_auth_header)"',
    'echo',
  ].join('\n');
}
