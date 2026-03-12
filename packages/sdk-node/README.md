# @consensus-tools/sdk-node

Node.js HTTP server for [consensus-tools](https://github.com/consensus-tools/consensus-tools) local board.

[![npm](https://img.shields.io/npm/v/@consensus-tools/sdk-node)](https://www.npmjs.com/package/@consensus-tools/sdk-node)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/sdk-node
```

## What it does

Full-featured HTTP server exposing the consensus protocol as a REST API. Handles job CRUD, guard evaluation, HITL approvals, workflow execution, agent management, webhook ingestion (GitHub, Slack, Teams, Discord, Telegram), and credential management. Built on Node.js `http` module with CORS and Bearer token authentication.

## Usage

```typescript
import { ConsensusToolsServer } from "@consensus-tools/sdk-node";

const server = new ConsensusToolsServer({
  engine: jobEngine,
  ledger: ledgerEngine,
  storage,
  host: "127.0.0.1",
  port: 9888,
  authToken: "your-token",
  // Optional capabilities
  guardEngine,
  hitlTracker,
  agentRegistry,
  workflowRunner,
  cronScheduler,
  credentialManager,
});

await server.start();
```

## REST endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/jobs` | Post a new job |
| `GET` | `/jobs` | List jobs |
| `GET` | `/jobs/:id` | Get job by ID |
| `POST` | `/jobs/:id/claim` | Claim a job |
| `POST` | `/jobs/:id/submit` | Submit artifacts |
| `POST` | `/jobs/:id/vote` | Vote on a submission |
| `POST` | `/jobs/:id/resolve` | Resolve a job |
| `GET` | `/ledger/:agentId` | Get agent balance |
| `POST` | `/api/guard.evaluate` | Evaluate a guard action |
| `POST` | `/api/human.approve` | Submit HITL approval |
| `GET` | `/api/hitl/pending` | List pending approvals |
| `GET/POST` | `/api/agents` | List or create agents |
| `POST` | `/api/agents/:id/trigger` | Trigger agent tool execution |
| `GET/POST/PUT/DELETE` | `/api/workflows` | Workflow CRUD |
| `POST` | `/api/workflows/:id/run` | Execute a workflow |
| `POST` | `/api/workflow-runs/:id/approve` | Approve/reject a HITL pause |
| `GET/POST` | `/api/mcp/boards` | List or create boards |
| `GET` | `/api/mcp/boards/:id` | Get board detail with runs |
| `GET` | `/api/mcp/runs/:id` | Get run detail with events |
| `GET/DELETE` | `/api/mcp/events` | Query or clear audit events |
| `GET` | `/api/mcp/participants/:boardId` | List board participants |
| `POST` | `/api/webhooks/:platform` | Ingest webhooks (github, slack, teams, discord, telegram) |

## API

| Export | Description |
|--------|-------------|
| `ConsensusToolsServer` | HTTP server with REST API, CORS, and auth |

## How it fits

Tier 4 package. Depends on `core`, `guards`, `workflows`, `integrations`, `secrets`, and `notifications`. Used by `local-board` to run the standalone API server.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
