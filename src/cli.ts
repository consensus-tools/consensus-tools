import { readFileSync, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ConsensusToolsConfig, Job } from './types';
import { renderTable } from './util/table';
import { runConsensusPolicyTests } from '../tests/runner/consensusTestRunner';

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

export function registerCli(program: any, backend: ConsensusToolsBackendCli, config: ConsensusToolsConfig, agentId: string) {
  const consensus = program.command('consensus').description('Consensus tools');

  consensus
    .command('init')
    .description('Generate .consensus shell templates')
    .option('--force', 'Overwrite existing files')
    .action(async (opts: any) => {
      await writeInitTemplates(process.cwd(), Boolean(opts.force));
      console.log('Created .consensus templates.');
    });

  const configCmd = consensus.command('config').description('Manage config');
  configCmd
    .command('get <key>')
    .description('Get a config value')
    .action(async (key: string) => {
      const cfg = await loadConfigFile();
      const value = getConfigValue(cfg, key);
      output(value ?? null, true);
    });

  configCmd
    .command('set <key> <value>')
    .description('Set a config value')
    .action(async (key: string, value: string) => {
      const cfg = await loadConfigFile();
      const parsed = parseValue(value);
      setConfigValue(cfg, key, parsed);
      await saveConfigFile(cfg);
      output({ ok: true }, true);
    });

  const board = consensus.command('board').description('Manage active board');
  board
    .command('use <type> [url]')
    .description('Select local or remote board')
    .action(async (type: string, url?: string) => {
      const cfg = await loadConfigFile();
      if (type !== 'local' && type !== 'remote') {
        throw new Error('board type must be local or remote');
      }
      cfg.activeBoard = type;
      if (type === 'remote' && url) {
        cfg.boards.remote.url = url;
      }
      await saveConfigFile(cfg);
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
    .option('--lease <seconds>', 'Lease seconds', parseInt)
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
        expiresSeconds: opts.lease
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
    .option('--weight <n>', 'Vote weight', parseFloat)
    .option('--json', 'JSON output')
    .action(async (jobId: string, opts: any) => {
      const vote = await backend.vote(agentId, jobId, {
        submissionId: opts.submission,
        choiceKey: opts.choice,
        targetType: opts.submission ? 'SUBMISSION' : opts.choice ? 'CHOICE' : undefined,
        targetId: opts.submission ?? opts.choice,
        weight: opts.weight ?? 1,
        score: opts.weight ?? 1
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
    .option('--script <path>', 'Path to generation script', 'tests/runner/generation.ts')
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

type ConsensusConfig = {
  activeBoard: 'local' | 'remote';
  boards: {
    local: { type: 'local'; root: string; jobsPath: string; ledgerPath: string };
    remote: { type: 'remote'; url: string; boardId: string; auth: { type: 'apiKey'; apiKeyEnv: string } };
  };
  defaults: { policy: string; reward: number; stake: number; leaseSeconds: number };
};

const defaultConsensusConfig: ConsensusConfig = {
  activeBoard: 'local',
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
      boardId: 'board_replace_me',
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

function configPath(): string {
  const envPath = process.env.CONSENSUS_CONFIG;
  if (envPath) return expandHome(envPath);
  return path.join(os.homedir(), '.consensus', 'config.json');
}

function expandHome(input: string): string {
  if (!input.startsWith('~')) return input;
  return path.join(os.homedir(), input.slice(1));
}

async function loadConfigFile(): Promise<ConsensusConfig> {
  const filePath = configPath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as ConsensusConfig;
  } catch {
    return JSON.parse(JSON.stringify(defaultConsensusConfig)) as ConsensusConfig;
  }
}

async function saveConfigFile(config: ConsensusConfig): Promise<void> {
  const filePath = configPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf8');
}

function getConfigValue(config: any, key: string): any {
  return key.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), config);
}

function setConfigValue(config: any, key: string, value: any): void {
  const parts = key.split('.');
  let cur = config as any;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (!cur[parts[i]]) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function parseValue(input: string): any {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

async function writeInitTemplates(rootDir: string, force: boolean): Promise<void> {
  const baseDir = path.join(rootDir, '.consensus');
  const apiDir = path.join(baseDir, 'api');

  await fs.mkdir(apiDir, { recursive: true });

  const files: Array<{ path: string; content: string; executable?: boolean }> = [
    { path: path.join(baseDir, 'README.md'), content: consensusReadme() },
    { path: path.join(baseDir, 'env.example'), content: envExample() },
    { path: path.join(baseDir, 'config.json'), content: JSON.stringify(defaultConsensusConfig, null, 2) },
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
    'This folder is generated by `consensus init`.',
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

function envExample(): string {
  return [
    '# Mode: "local" or "remote"',
    'export CONSENSUS_MODE=local',
    '',
    '# Local board root (JSON filesystem board)',
    'export CONSENSUS_ROOT="$HOME/.openclaw/workplace/consensus-board"',
    '',
    '# Remote board settings',
    'export CONSENSUS_URL="https://api.consensus.tools"',
    'export CONSENSUS_BOARD_ID="board_replace_me"',
    'export CONSENSUS_API_KEY="replace_me"',
    '',
    '# Defaults (used by jobs_post.sh if not provided)',
    'export CONSENSUS_DEFAULT_POLICY="HIGHEST_CONFIDENCE_SINGLE"',
    'export CONSENSUS_DEFAULT_REWARD="8"',
    'export CONSENSUS_DEFAULT_STAKE="4"',
    'export CONSENSUS_DEFAULT_LEASE_SECONDS="180"',
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
    'remote_auth_header() {',
    '  require_env "CONSENSUS_API_KEY"',
    '  echo "Authorization: Bearer ${CONSENSUS_API_KEY}"',
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
    'STAKE="${CONSENSUS_DEFAULT_STAKE:-4}"',
    'LEASE_SECONDS="${CONSENSUS_DEFAULT_LEASE_SECONDS:-180}"',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  local id; id="$(rand_id "job")"',
    '',
    '  local title_json desc_json input_json',
    '  title_json="$(json_escape "$TITLE")"',
    '  desc_json="$(json_escape "${DESC:-}")"',
    '  input_json="$(json_escape "${INPUT:-}")"',
    '',
    '  local job_json',
    '  job_json="$(cat <<JSON',
    '{',
    '  "id": "$id",',
    '  "title": $title_json,',
    '  "desc": $desc_json,',
    '  "input": $input_json,',
    '  "mode": "SUBMISSION",',
    '  "policyKey": "$POLICY",',
    '  "rewardAmount": $REWARD,',
    '  "stakeAmount": $STAKE,',
    '  "leaseSeconds": $LEASE_SECONDS,',
    '  "status": "OPEN",',
    '  "createdAt": "$(now_iso)"',
    '}',
    'JSON',
    ')"',
    '  write_json_file "$(job_file "$id")" "$job_json"',
    '  ensure_job_dir "$id"',
    '  echo "$job_json"',
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
    '  "stakeAmount": $STAKE,',
    '  "leaseSeconds": $LEASE_SECONDS',
    '}',
    'JSON',
    ')"',
    'curl_json "POST" "$base/jobs" "$payload"',
    'echo',
    ''
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
    '  read_json_file "$(job_file "$JOB_ID")"',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'curl -sS "$base/jobs/$JOB_ID" -H "$(remote_auth_header)"',
    'echo',
    ''
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
    '  root="$(local_root)"',
    '  ls -1 "$root/jobs"/*.json 2>/dev/null | sed "s#.*/##" | sed "s#\\.json$##" || true',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    '# Optional: pass query string as $1, e.g. "status=OPEN&mode=SUBMISSION"',
    'QS="${1:-}"',
    'url="$base/jobs"',
    'if [[ -n "$QS" ]]; then',
    '  url="$url?$QS"',
    'fi',
    'curl -sS "$url" -H "$(remote_auth_header)"',
    'echo',
    ''
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
    '',
    'if [[ -z "$JOB_ID" || -z "$ARTIFACT_JSON" ]]; then',
    '  echo "Usage: submissions_create.sh <jobId> <artifact_json> [summary]" >&2',
    '  echo "Example: submissions_create.sh job_... {\\\"toxic\\\":false,\\\"confidence\\\":0.98,\\\"brief_reason\\\":\\\"...\\\"}" >&2',
    '  exit 2',
    'fi',
    '',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  ensure_job_dir "$JOB_ID"',
    '',
    '  sid="$(rand_id "sub")"',
    '  summary_json="$(json_escape "${SUMMARY:-}")"',
    '  sub_json="$(cat <<JSON',
    '{',
    '  "id": "$sid",',
    '  "jobId": "$JOB_ID",',
    '  "artifact": $ARTIFACT_JSON,',
    '  "summary": $summary_json,',
    '  "createdAt": "$(now_iso)",',
    '  "status": "VALID"',
    '}',
    'JSON',
    ')"',
    '  write_json_file "$(job_dir "$JOB_ID")/submissions/${sid}.json" "$sub_json"',
    '  echo "$sub_json"',
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
    ''
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
    '  ensure_job_dir "$JOB_ID"',
    '  ls -1 "$(job_dir "$JOB_ID")/submissions"/*.json 2>/dev/null | xargs -I{} cat "{}" || true',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'curl -sS "$base/jobs/$JOB_ID/submissions" -H "$(remote_auth_header)"',
    'echo',
    ''
  ].join('\n');
}

function votesCastSh(): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'source "$(dirname "$0")/common.sh"',
    '',
    'JOB_ID="${1:-}"',
    'TARGET_TYPE="${2:-}"   # SUBMISSION or CHOICE',
    'TARGET_ID="${3:-}"     # submission id or choice key',
    'WEIGHT="${4:-1}"',
    '',
    'if [[ -z "$JOB_ID" || -z "$TARGET_TYPE" || -z "$TARGET_ID" ]]; then',
    '  echo "Usage: votes_cast.sh <jobId> <targetType:SUBMISSION|CHOICE> <targetId> [weight]" >&2',
    '  echo "Example: votes_cast.sh job_... SUBMISSION sub_... 1" >&2',
    '  echo "Example: votes_cast.sh job_... CHOICE TOXIC_FALSE 1" >&2',
    '  exit 2',
    'fi',
    '',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  ensure_job_dir "$JOB_ID"',
    '',
    '  vid="$(rand_id "vote")"',
    '  vote_json="$(cat <<JSON',
    '{',
    '  "id": "$vid",',
    '  "jobId": "$JOB_ID",',
    '  "targetType": "$TARGET_TYPE",',
    '  "targetId": "$TARGET_ID",',
    '  "weight": $WEIGHT,',
    '  "createdAt": "$(now_iso)"',
    '}',
    'JSON',
    ')"',
    '  write_json_file "$(job_dir "$JOB_ID")/votes/${vid}.json" "$vote_json"',
    '  echo "$vote_json"',
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
    ''
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
    '  ensure_job_dir "$JOB_ID"',
    '  ls -1 "$(job_dir "$JOB_ID")/votes"/*.json 2>/dev/null | xargs -I{} cat "{}" || true',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'curl -sS "$base/jobs/$JOB_ID/votes" -H "$(remote_auth_header)"',
    'echo',
    ''
  ].join('\n');
}

function resolveSh(): string {
  return [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'source "$(dirname "$0")/common.sh"',
    '',
    'JOB_ID="${1:-}"',
    'if [[ -z "$JOB_ID" ]]; then',
    '  echo "Usage: resolve.sh <jobId>" >&2',
    '  exit 2',
    'fi',
    '',
    'MODE="$(mode)"',
    '',
    'if [[ "$MODE" == "local" ]]; then',
    '  ensure_local_board',
    '  ensure_job_dir "$JOB_ID"',
    '',
    '  # Local resolution policy: HIGHEST_CONFIDENCE_SINGLE for SUBMISSION jobs.',
    '  # We pick the submission with max artifact.confidence if present.',
    '  # If missing, we fall back to the most recent submission.',
    '',
    '  dir="$(job_dir "$JOB_ID")/submissions"',
    '  if ! ls "$dir"/*.json >/dev/null 2>&1; then',
    '    echo "No submissions found for $JOB_ID" >&2',
    '    exit 1',
    '  fi',
    '',
    '  python3 - <<\'PY\' "$JOB_ID" "$dir" | tee "$(job_dir "$JOB_ID")/result.json"',
    'import json,glob,sys,os',
    'job_id=sys.argv[1]; d=sys.argv[2]',
    'subs=[]',
    'for p in glob.glob(os.path.join(d,"*.json")):',
    '    with open(p,"r") as f:',
    '        s=json.load(f)',
    '    conf=None',
    '    try:',
    '        conf=float(s.get("artifact",{}).get("confidence"))',
    '    except Exception:',
    '        conf=None',
    '    subs.append((conf,s.get("createdAt",""),s,p))',
    '# sort: confidence desc (None last), then createdAt desc',
    'def key(t):',
    '    conf,created,_,_ = t',
    '    return (conf is not None, conf if conf is not None else -1.0, created)',
    'subs_sorted=sorted(subs, key=key, reverse=True)',
    'conf,created,s,p=subs_sorted[0]',
    'result={',
    '  "jobId": job_id,',
    '  "mode": "SUBMISSION",',
    '  "selectedSubmissionId": s.get("id"),',
    '  "selectedSubmissionPath": p,',
    '  "resolvedAt": __import__("datetime").datetime.utcnow().isoformat()+"Z",',
    '  "artifact": s.get("artifact"),',
    '  "summary": s.get("summary","")',
    '}',
    'print(json.dumps(result, indent=2))',
    'PY',
    '',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'curl -sS -X POST "$base/jobs/$JOB_ID/resolve" -H "$(remote_auth_header)"',
    'echo',
    ''
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
    '  path="$(job_dir "$JOB_ID")/result.json"',
    '  read_json_file "$path"',
    '  exit 0',
    'fi',
    '',
    'base="$(remote_base)"',
    'curl -sS "$base/jobs/$JOB_ID/result" -H "$(remote_auth_header)"',
    'echo',
    ''
  ].join('\n');
}
