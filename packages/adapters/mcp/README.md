# @consensus-tools/mcp

Model Context Protocol (MCP) server adapter for [consensus-tools](https://github.com/consensus-tools/consensus-tools). Exposes the full consensus protocol as 29 MCP tools for LLM agents.

[![npm](https://img.shields.io/npm/v/@consensus-tools/mcp)](https://www.npmjs.com/package/@consensus-tools/mcp)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/mcp
```

## What it does

Runs an MCP server over stdio that exposes consensus jobs, guard evaluation, agent management, HITL approvals, board observability, and workflow execution as native LLM tools. Any MCP-compatible client (Claude Desktop, Cursor, custom agents) can call these tools directly.

## Tools (29 total)

| Category | Tools | Count |
|----------|-------|-------|
| **Consensus** | `consensus_post_job`, `consensus_list_jobs`, `consensus_submit`, `consensus_vote`, `consensus_status` | 5 |
| **Guards** | `guard.evaluate`, `guard.send_email`, `guard.code_merge`, `guard.publish`, `guard.support_reply`, `guard.agent_action`, `guard.deployment`, `guard.permission_escalation`, `guard.policy.describe` | 9 |
| **Agents** | `agent.register`, `agent.list`, `agent.suspend`, `agent.activate` | 4 |
| **HITL** | `human.approve` | 1 |
| **Board** | `board.list`, `board.get`, `run.get`, `audit.search` | 4 |
| **Workflows** | `workflow.create`, `workflow.run`, `workflow.list`, `cron.register`, `cron.list`, `template.list` | 6 |

## Usage

### Standalone server

```bash
node dist/entry.js
```

### Programmatic

```typescript
import { startMcpServer } from "@consensus-tools/mcp";

await startMcpServer({
  engine: jobEngine,
  storage,
  agentId: "mcp-agent",
  agentRegistry,
  guardEngine,
  hitlTracker,
  workflowRunner,
  cronScheduler,
});
```

### Claude Desktop configuration

```json
{
  "mcpServers": {
    "consensus-tools": {
      "command": "node",
      "args": ["/path/to/consensus-tools/packages/adapters/mcp/dist/entry.js"]
    }
  }
}
```

## API

| Export | Description |
|--------|-------------|
| `startMcpServer(ctx)` | Start MCP server on stdio transport |
| `createMcpServer(ctx)` | Create MCP server instance without starting |
| `McpServerAdapter` | MCP protocol adapter class |
| `mcpToolDefinitions` | All tool definitions for integration |

## How it fits

Tier 4 package. Depends on `core`, `guards`, `policies`, `workflows`, `wrapper`, and `@modelcontextprotocol/sdk`. Runs as a standalone process or embedded in a larger application.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
