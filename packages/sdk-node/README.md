# @consensus-tools/sdk-node

HTTP server that exposes the full consensus-tools protocol as a REST API. Supports jobs, ledger, guards, agents, workflows, cron, webhooks (GitHub, Linear, Slack, Teams, Discord, Telegram), and credential management.

## Install

```bash
pnpm add @consensus-tools/sdk-node
```

## Quick Start

```typescript
import { ConsensusToolsServer } from "@consensus-tools/sdk-node";
import { JobEngine, LedgerEngine, createStorage, AgentRegistry, GuardEngine } from "@consensus-tools/core";

const storage = await createStorage(config);
const ledger = new LedgerEngine(storage, config);
const engine = new JobEngine(storage, ledger, config);

const server = new ConsensusToolsServer({
  config,
  engine,
  ledger,
  storage,
});

await server.start();
// Consensus API running on host:port from config
```

## Full Setup with Workflows and Webhooks

```typescript
import { ConsensusToolsServer } from "@consensus-tools/sdk-node";
import { WorkflowRunner, CronScheduler } from "@consensus-tools/workflows";
import { JobEngine, LedgerEngine, AgentRegistry, GuardEngine, HitlTracker, createStorage } from "@consensus-tools/core";

const storage = await createStorage(config);
const ledger = new LedgerEngine(storage, config);
const engine = new JobEngine(storage, ledger, config);
const workflowRunner = new WorkflowRunner(storage);
const cronScheduler = new CronScheduler(storage, (wfId) => workflowRunner.run(wfId));

const server = new ConsensusToolsServer({
  config,
  engine,
  ledger,
  storage,
  agentRegistry: new AgentRegistry(storage),
  guardEngine: new GuardEngine({ storage }),
  hitlTracker: new HitlTracker({ storage }),
  workflowRunner,
  cronScheduler,
});

await server.start();
```

## API Endpoints

The server exposes REST endpoints for all consensus-tools operations:

| Area | Example Endpoints |
|---|---|
| Jobs | `POST /api/jobs`, `GET /api/jobs`, `POST /api/jobs/:id/claim`, `POST /api/jobs/:id/submit`, `POST /api/jobs/:id/vote`, `POST /api/jobs/:id/resolve` |
| Ledger | `GET /api/ledger/:agentId`, `POST /api/ledger/faucet` |
| Agents | `POST /api/agents`, `GET /api/agents`, `POST /api/agents/:id/suspend` |
| Guards | `POST /api/guard/evaluate` |
| Workflows | `POST /api/workflows`, `POST /api/workflows/:id/run`, `POST /api/workflows/:id/resume` |
| Cron | `POST /api/cron/register`, `GET /api/cron` |
| Webhooks | `POST /api/webhooks/github`, `POST /api/webhooks/linear`, `POST /api/webhooks/slack` |
| Templates | `GET /api/templates` |

## ServerDeps

| Property | Required | Description |
|---|---|---|
| `config` | Yes | `ConsensusToolsConfig` |
| `engine` | Yes | `JobEngine` |
| `ledger` | Yes | `LedgerEngine` |
| `storage` | Yes | `IStorage` |
| `agentRegistry` | No | `AgentRegistry` for agent management |
| `guardEngine` | No | `GuardEngine` for action evaluation |
| `hitlTracker` | No | `HitlTracker` for human approval flows |
| `workflowRunner` | No | `WorkflowRunner` for workflow execution |
| `cronScheduler` | No | `CronScheduler` for scheduled workflows |
| `credentialManager` | No | `CredentialManager` for secrets |
| `logger` | No | Logger with `info` and `warn` methods |

## Exports

| Export | Description |
|---|---|
| `ConsensusToolsServer` | HTTP server class -- call `.start()` to listen and `.stop()` to shut down |
| `ServerDeps` | Configuration object type for the server constructor |
| `WorkflowRunner` | Minimal workflow runner interface (for type compatibility) |
| `CronScheduler` | Minimal cron scheduler interface |
| `WebhookHandlerContext` | Context passed to webhook handlers |
| `HandlerResult` | Return type from webhook handlers |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
