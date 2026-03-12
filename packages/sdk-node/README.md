# @consensus-tools/sdk-node

Node.js HTTP server for consensus-tools — exposes the protocol as a REST API.

## Install

```bash
pnpm add @consensus-tools/sdk-node
```

## Usage

```typescript
import { ConsensusToolsServer } from "@consensus-tools/sdk-node";
import { createStorage, JobEngine, LedgerEngine } from "@consensus-tools/core";

const storage = createStorage();
const server = new ConsensusToolsServer({
  config: { name: "my-board" },
  engine: new JobEngine(storage),
  ledger: new LedgerEngine(storage),
  storage,
});

server.listen(3000);
```

## What's included

- **`ConsensusToolsServer`** — HTTP server with job, workflow, and webhook endpoints
- **Types** — `ServerDeps`, `WorkflowRunner`, `CronScheduler`, `WebhookHandlerContext`

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
