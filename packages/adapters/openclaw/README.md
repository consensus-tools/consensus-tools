# @consensus-tools/openclaw

OpenClaw plugin that registers consensus-tools as agent tools. Supports both local (in-process) and global (remote server) modes, with automatic config loading and agent identity resolution.

## Install

```bash
pnpm add @consensus-tools/openclaw
```

## Quick Start -- Plugin Registration

The `register` function is the standard OpenClaw plugin entry point. It wires up storage, engines, and tools automatically:

```typescript
import { register } from "@consensus-tools/openclaw";

// Called by OpenClaw during plugin loading
await register(api);
```

This registers five tools on the OpenClaw agent:

| Tool | Description |
|---|---|
| `consensus-tools_post_job` | Post a new job (title, description, reward, etc.) |
| `consensus-tools_list_jobs` | List jobs with optional filters |
| `consensus-tools_submit` | Submit artifacts to a job |
| `consensus-tools_vote` | Vote on a submission |
| `consensus-tools_status` | Get job status, claims, submissions, resolution |

## OpenClaw Plugin Configuration

Configure via your OpenClaw plugin config under the `consensus-tools` key:

```json
{
  "mode": "local",
  "local": {
    "storage": { "kind": "json", "path": "./.openclaw/consensus-tools.json" },
    "jobDefaults": { "reward": 10, "stakeRequired": 1 },
    "ledger": { "faucetEnabled": false, "initialCreditsPerAgent": 0 }
  },
  "global": { "baseUrl": "http://localhost:9888", "accessToken": "" },
  "agentIdentity": { "agentIdSource": "openclaw", "manualAgentId": "" },
  "safety": { "requireOptionalToolsOptIn": true, "allowNetworkSideEffects": false }
}
```

Set `mode` to `"global"` to route all operations through a remote consensus-tools server instead of local storage.

## Advanced -- Build Your Own Backend

```typescript
import { createBackend, createService, loadConfig, resolveAgentId } from "@consensus-tools/openclaw";

const config = loadConfig(api);
const agentId = resolveAgentId(api, config);

// createBackend returns a ConsensusToolsBackend with all operations
const backend = createBackend(config, engine, ledger, client, storage, logger, agentId);

await backend.postJob(agentId, { title: "Review", description: "..." });
const jobs = await backend.listJobs({ status: "OPEN" });
const balance = await backend.getLedgerBalance(agentId);
const diag = await backend.getDiagnostics();
```

## Agent Identity Resolution

The plugin resolves agent identity in order:

1. `agentIdentity.manualAgentId` (if `agentIdSource` is `"manual"`)
2. `OPENCLAW_AGENT_ID` or `CONSENSUS_TOOLS_AGENT_ID` env vars (if `agentIdSource` is `"env"`)
3. OpenClaw API agent ID (default `"openclaw"` source)

## Exports

| Export | Description |
|---|---|
| `register(api)` | OpenClaw plugin entry point -- sets up everything |
| `registerTools(api, backend, config, agentId)` | Register individual tools on an OpenClaw API |
| `createBackend(config, engine, ledger, client, storage, logger, agentId)` | Create a `ConsensusToolsBackend` (local or global) |
| `createService(config, backend, agentId, capabilities, logger)` | Create an OpenClaw service with start/stop |
| `loadConfig(api, logger?)` | Load and merge plugin config from OpenClaw |
| `resolveAgentId(api, config)` | Resolve the agent identity |
| `defaultConfig` | Default `ConsensusToolsConfig` |
| `PLUGIN_ID` | `"consensus-tools"` |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/toolkit)
