# @consensus-tools/mcp

Model Context Protocol (MCP) server that exposes consensus-tools as tools, resources, and prompts for LLM agents. Gives Claude Code (or any MCP client) the ability to post jobs, evaluate guards, manage agents, run workflows, and track human approvals.

## Install

```bash
pnpm add @consensus-tools/mcp
```

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

## Programmatic Usage

```typescript
import { createMcpServer, startMcpServer } from "@consensus-tools/mcp";
import { JobEngine, LedgerEngine, AgentRegistry, GuardEngine, HitlTracker, createStorage } from "@consensus-tools/core";
import type { McpContext } from "@consensus-tools/mcp";

const storage = await createStorage(config);
const ctx: McpContext = {
  engine: new JobEngine(storage, ledger, config),
  agentRegistry: new AgentRegistry(storage),
  guardEngine: new GuardEngine({ storage }),
  hitlTracker: new HitlTracker({ storage }),
  storage,
  agentId: "my-agent",
};

// Option 1: start on stdio (typical for MCP)
await startMcpServer(ctx);

// Option 2: get the server instance for custom transport
const server = createMcpServer(ctx);
```

## Exposed MCP Tools

The server registers tools across six categories:

| Category | Tools | Description |
|---|---|---|
| Guard | `guard.evaluate`, `guard.explain`, ... | Evaluate agent actions against policies |
| Agent | `agent.create`, `agent.list`, `agent.suspend`, ... | Manage agent identities and scopes |
| Consensus | `consensus_post_job`, `consensus_claim`, `consensus_submit`, `consensus_vote`, `consensus_resolve`, ... | Full job lifecycle |
| HITL | `human.request_approval`, `human.check_status`, ... | Human-in-the-loop approval flows |
| Board | `board.status`, `run.list`, `audit.query`, ... | Board state and audit trail |
| Workflow | `workflow.create`, `workflow.run`, `cron.register`, ... | Workflow execution and scheduling |

The server also exposes **resources** (board state, job details) and **prompts** for guided interactions.

## McpContext

| Property | Required | Description |
|---|---|---|
| `engine` | Yes | `JobEngine` |
| `agentRegistry` | Yes | `AgentRegistry` |
| `guardEngine` | Yes | `GuardEngine` |
| `hitlTracker` | Yes | `HitlTracker` |
| `storage` | Yes | `IStorage` |
| `agentId` | Yes | Default agent identity |
| `workflowRunner` | No | `WorkflowRunner` for workflow tools |
| `cronScheduler` | No | `CronScheduler` for cron tools |

## Exports

| Export | Description |
|---|---|
| `createMcpServer(ctx)` | Creates an MCP `Server` with all tools, resources, and prompts registered |
| `startMcpServer(ctx)` | Creates the server and connects via stdio transport |
| `McpContext` | Context type required by the server |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
