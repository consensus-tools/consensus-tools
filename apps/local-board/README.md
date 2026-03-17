# @consensus-tools/local-board

Run the full consensus-tools stack as a single local API server. Create jobs, manage agent ledgers, evaluate guards, run workflows, and store credentials -- all from one process with zero external dependencies.

## Quick start

```bash
# From the monorepo root
pnpm install
pnpm --filter @consensus-tools/local-board dev
```

The server starts at `http://127.0.0.1:9888`. All REST endpoints from `@consensus-tools/sdk-node` are available immediately.

## What it runs

The server wires together every core engine in a single process:

| Engine              | Purpose                                              |
|---------------------|------------------------------------------------------|
| JobEngine           | Job lifecycle -- create, submit, finalize, expire    |
| LedgerEngine        | Agent credit balances, faucet, payouts               |
| GuardEngine         | Deterministic guard evaluation pipeline              |
| HitlTracker         | Human-in-the-loop approval tracking                  |
| WorkflowRunner      | DAG-based workflow execution with checkpoint storage  |
| PolicyResolver      | All registered consensus policies (9 built-in)       |
| CredentialManager   | Encrypted credential storage (OS keychain)           |
| ConsensusToolsServer| HTTP server exposing all engines as REST endpoints   |

## Default configuration

| Setting            | Value                                |
|--------------------|--------------------------------------|
| Host               | `127.0.0.1`                          |
| Port               | `9888`                               |
| Storage            | JSON file at `.data/consensus.json`  |
| Default reward     | 10 credits                           |
| Default stake      | 1 credit                             |
| Max participants   | 3                                    |
| Expiry             | 86400 seconds (24 hours)             |
| Consensus policy   | `FIRST_SUBMISSION_WINS`              |
| Slashing           | Disabled                             |
| Faucet             | Enabled, 100 initial credits/agent   |

## Scripts

```bash
pnpm --filter @consensus-tools/local-board dev        # Start with tsx (hot reload)
pnpm --filter @consensus-tools/local-board build      # Compile to dist/
pnpm --filter @consensus-tools/local-board typecheck   # Type-check without emit
```

## Storage

All state persists to `.data/consensus.json` in the app directory. Delete this file to reset all jobs, balances, and workflow checkpoints.

## API reference

See the [sdk-node README](../../packages/sdk-node/README.md) for the full endpoint table covering jobs, submissions, ledger, guards, workflows, and credentials.
