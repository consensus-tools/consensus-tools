# @consensus-tools/local-board

Standalone API server that bundles the full consensus-tools stack into a single runnable service.

## What it runs

Initializes and wires together:

- **JobEngine** + **LedgerEngine** — job lifecycle and economic ledger
- **GuardEngine** — guard evaluation with deterministic evaluators
- **HitlTracker** — human-in-the-loop approval tracking
- **WorkflowRunner** — DAG-based workflow execution with checkpoint persistence
- **CronScheduler** — scheduled workflow triggering
- **PolicyResolver** — all 9 consensus policies registered
- **CredentialManager** — encrypted credential storage
- **ConsensusToolsServer** — HTTP server exposing everything as REST endpoints

## Configuration

| Setting | Default |
|---------|---------|
| Host | `127.0.0.1` |
| Port | `9888` |
| Storage | JSON file at `.data/consensus.json` |
| Default reward | 10 |
| Default stake | 1 |
| Max participants | 3 |
| Expires | 86400 seconds (24h) |
| Default policy | `FIRST_SUBMISSION_WINS` |

## Development

```bash
pnpm --filter @consensus-tools/local-board dev
```

The server starts at `http://127.0.0.1:9888`. All API endpoints from `@consensus-tools/sdk-node` are available — see the [sdk-node README](../../packages/sdk-node/README.md) for the full endpoint table.

## Build

```bash
pnpm --filter @consensus-tools/local-board build
```
