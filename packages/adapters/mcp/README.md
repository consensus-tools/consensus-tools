# @consensus-tools/mcp

Model Context Protocol (MCP) server that exposes consensus-tools as tools, resources, and prompts for LLM agents. Gives Claude Code (or any MCP client) the ability to post consensus jobs, evaluate governance guards, manage agents, run workflows, and record human approvals — all backed by a local, auditable ledger.

## Install

```bash
pnpm add @consensus-tools/mcp
```

Requires Node.js >= 20.

## Claude Code Integration

Add to your `.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "consensus-tools": {
      "command": "npx",
      "args": ["@consensus-tools/mcp"]
    }
  }
}
```

With environment configuration:

```json
{
  "mcpServers": {
    "consensus-tools": {
      "command": "npx",
      "args": ["@consensus-tools/mcp"],
      "env": {
        "CONSENSUS_STORAGE_PATH": "/path/to/state.json",
        "CONSENSUS_AGENT_ID": "my-agent"
      }
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `CONSENSUS_STORAGE_PATH` | `~/.local/share/consensus-tools/state.json` | Path to the JSON state file |
| `CONSENSUS_AGENT_ID` | `mcp-agent` | Agent identity for consensus operations |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | — | Optional. Only `audit.explain` uses an LLM (see below) |

## Exposed MCP Tools

The standalone server (via `npx @consensus-tools/mcp`) registers **31 tools** across six areas. Consensus tools use `snake_case`; the rest use dotted names.

### Guard & Policy (10)

| Tool | Description |
|---|---|
| `guard.evaluate` | Evaluate any action against guard policies. Requires an explicit `action.type` the server has an evaluator for (the built-in domains, plus any custom evaluators registered on the engine's registry) |
| `guard.send_email` | Evaluate an outbound email — flags secrets/credentials and risky attachments |
| `guard.code_merge` | Evaluate a PR/merge — flags auth/security/crypto file changes, failing tests, and vulnerability patterns in the diff |
| `guard.publish` | Evaluate content before publishing — detects profanity and PII (e.g. SSN) |
| `guard.support_reply` | Evaluate a support reply — escalates refund commitments and legal threats |
| `guard.agent_action` | Evaluate a generic agent action — blocks unapproved irreversible actions |
| `guard.deployment` | Evaluate a deployment — flags production deploys for review |
| `guard.permission_escalation` | Evaluate a privilege change — flags break-glass and wildcard grants |
| `policy.assign` | Assign a guard policy to a board (weighting mode + quorum). Upserts. Once assigned, `guard.*` evaluations on that board honor the policy — quorum governs weighted decisions and high-risk actions route to human review (`REQUIRE_HUMAN`) |
| `policy.list` | List policy assignments, optionally filtered by board |

The domain guard tools accept ergonomic payload keys (`filesChanged`, `diff`, `content`, `replyText`, `deployEnv`, `requestedPermissions`, `attachments`, ...); the adapter translates them to the evaluator contract before evaluation.

When a `guard.*` call returns `REQUIRE_HUMAN`, the adapter registers a pending approval keyed on the call's `runId` (minted and returned if the caller didn't supply one). The response's `next_step` points at `human.approve` with that `runId`; unanswered escalations auto-`BLOCK` after 15 minutes, the same deadline as workflow `hitl` nodes.

### Agent (4)

| Tool | Description |
|---|---|
| `agent.register` | Register an agent (id, name, kind, scopes) |
| `agent.list` | List all registered agents |
| `agent.suspend` | Suspend an agent by ID |
| `agent.activate` | Re-activate a suspended agent |

### Consensus jobs (5)

| Tool | Description |
|---|---|
| `consensus_post_job` | Post a new consensus job to the local board |
| `consensus_list_jobs` | List jobs, optionally filtered by status/tag |
| `consensus_submit` | Submit artifacts to a job |
| `consensus_vote` | Vote on a submission |
| `consensus_status` | Get job status and resolution details |

### Human-in-the-loop (1)

| Tool | Description |
|---|---|
| `human.approve` | Submit a human decision (YES / NO / REWRITE) for a run awaiting approval — either a workflow `hitl` node or a standalone `guard.*` call that returned `REQUIRE_HUMAN`. On completion it resumes the paused workflow (if any) with the worst decision across all quorum votes (NO > REWRITE > YES), so any NO blocks the guarded action. Idempotent per (`runId`, `idempotencyKey`, `approver`) |

### Board & Audit (6)

| Tool | Description |
|---|---|
| `board.list` | List all boards derived from jobs and audit events |
| `board.get` | Get jobs, submissions, and board-scoped guard results for one board |
| `run.get` | Get the record and event history for a job or guard run |
| `audit.search` | Full-text / field search across audit events (`type:`, `runId:`, `boardId:`), up to 500 results |
| `audit.explain` | LLM-generated explanation of a guard decision (needs an API key + SDK — see below) |
| `audit.summary` | Aggregate summary of recent guard decisions by domain, outcome, and risk |

### Workflow & Cron (5)

Available when the context provides a `workflowRunner` / `cronScheduler` (the standalone server wires both):

| Tool | Description |
|---|---|
| `workflow.create` | Create a workflow definition (optionally from a template) |
| `workflow.run` | Execute a workflow by ID |
| `workflow.list` | List registered workflows |
| `cron.register` | Register a cron schedule for a workflow (replaces any existing) |
| `cron.list` | List registered cron schedules |

### `audit.explain` and LLM SDKs

`audit.explain` is the only tool that calls an LLM. Set `ANTHROPIC_API_KEY` (preferred) or `OPENAI_API_KEY`, and install the matching SDK yourself — they are optional and not bundled:

```bash
npm install @anthropic-ai/sdk   # or: npm install openai
```

If a key is set but the SDK isn't installed, the tool returns an actionable error telling you which package to install. Every other tool works with zero external dependencies.

## Resources

The server exposes board data as MCP resources (`application/json`):

| URI template | Contents |
|---|---|
| `consensus://boards/{boardId}/jobs` | Jobs for the board |
| `consensus://boards/{boardId}/ledger` | Credit ledger (global — the ledger is shared across boards) |
| `consensus://boards/{boardId}/agents` | Registered agents (global — agents are not scoped per board) |

`resources/list` enumerates one entry per discovered board.

## Prompts

Three guided prompts help clients drive common flows:

| Prompt | Purpose | Arguments |
|---|---|---|
| `post-job` | Create a well-formed consensus job | `title` (required), `mode` |
| `review-submission` | Review and vote on submissions | `jobId` (required) |
| `guard-evaluate` | Evaluate an action through the guard engine | `actionType` (required) |

## Programmatic Usage

The standalone entry point (`entry.ts`) is the reference wiring. To embed the server in your own process:

```typescript
import { startMcpServer, createMcpServer, type McpContext } from "@consensus-tools/mcp";
import {
  LocalBoard, AgentRegistry, GuardEngine, HitlTracker,
} from "@consensus-tools/core";
import { createStorage } from "@consensus-tools/storage";
import { createGuardEvaluatorRegistry } from "@consensus-tools/guards";

const storage = await createStorage(config);
const board = new LocalBoard(config, storage);
await board.init();

const agentRegistry = new AgentRegistry(storage);
const ctx: McpContext = {
  engine: board.engine,
  agentRegistry,
  guardEngine: new GuardEngine({ storage, agentRegistry, evaluatorRegistry: createGuardEvaluatorRegistry() }),
  hitlTracker: new HitlTracker({ storage }),
  storage,
  agentId: "my-agent",
  // workflowRunner / cronScheduler are optional — provide them to enable
  // the workflow.* and cron.* tools.
};

// Option 1: start on stdio (typical for MCP)
await startMcpServer(ctx);

// Option 2: get the Server instance for a custom transport
const server = createMcpServer(ctx);
```

## McpContext

| Property | Required | Description |
|---|---|---|
| `engine` | Yes | `JobEngine` |
| `agentRegistry` | Yes | `AgentRegistry` |
| `guardEngine` | Yes | `GuardEngine` |
| `hitlTracker` | Yes | `HitlTracker` |
| `storage` | Yes | `IStorage` |
| `agentId` | Yes | Default agent identity |
| `workflowRunner` | No | `WorkflowRunner` — enables the `workflow.*` tools and HITL resume |
| `cronScheduler` | No | `CronScheduler` — enables the `cron.*` tools |

## Exports

| Export | Description |
|---|---|
| `createMcpServer(ctx)` | Creates an MCP `Server` with all tools, resources, and prompts registered |
| `startMcpServer(ctx)` | Creates the server and connects via stdio transport |
| `McpContext` | Context type required by the server |

The advertised server version is read from `package.json`, so `initialize` always reports the published version.

## Trust model

The standalone server is designed for a **single, trusted MCP client** (your own agent) against a local board. Understand these boundaries before exposing it to an untrusted or multi-tenant client:

- **`human.approve` reports client-asserted identity.** The `approver` field is whatever the client sends — it is not authenticated. An `idempotencyKey` prevents an exact replay from double-counting, but an N-of-M human quorum is only meaningful when the client is trusted to supply distinct, real approver identities. Treat `human.approve` as an integration point for a trusted approval UI, not as a security boundary against an adversarial caller.
- **`policy.assign` is an operator-level lever.** It is exposed as a tool and can loosen or tighten a board's guard policy (including raising `hitlRequiredAboveRisk` to reduce human review). In an untrusted deployment, gate this tool to operators.
- **Guards evaluate the caller's self-declared payload.** A dishonest client can always describe a risky action as benign. Guards catch mistakes and enforce policy for a cooperating agent; they are not a sandbox around a hostile one.
- **`human.approve` idempotency is best-effort, not atomic.** The replay check, vote increment, and audit write happen in separate storage transactions. Two truly concurrent calls with the same `idempotencyKey` (or a crash between the increment and the audit write) could double-count a vote. This is not observable from a sequential stdio client; deployments that front the server with a concurrent transport should serialize `human.approve` calls per run.
- **N-of-M vote aggregation is race-safe only under a single sequential writer.** A completing vote computes the worst-of decision (NO > REWRITE > YES) from a state snapshot taken at the start of the call. Under genuinely concurrent votes on the same run, a later YES whose snapshot predates an earlier NO's audit write can resume the workflow as approved — losing the veto. The stdio server processes one request at a time, so this cannot occur there; any concurrent-writer deployment must serialize `human.approve` per run until per-voter decisions are persisted atomically on the approval record (tracked follow-up).

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/toolkit)
