# @consensus-tools/local-board

All-in-one API server running the full consensus-tools stack in a single process. Not published (private).

## Architecture

Bootstraps and wires together: `JobEngine`, `LedgerEngine`, `GuardEngine`, `HitlTracker`, `WorkflowRunner`, `CredentialManager`, and `ConsensusToolsServer`. Listens on `127.0.0.1:9888` with JSON file storage (`.data/consensus.json`).

## Dependencies

Imports from: core, storage, policies, sdk-node, workflows, secrets, schemas. This is the heaviest consumer in the monorepo — changes to any of these packages may break local-board.

## Commands

```bash
pnpm --filter @consensus-tools/local-board dev    # tsx hot reload
pnpm --filter @consensus-tools/local-board build   # production build
```

## Defaults

- 100 initial credits per agent (faucet enabled)
- 10 credit reward, 1 stake, 3 max participants
- 24hr job expiry, FIRST_SUBMISSION_WINS policy
