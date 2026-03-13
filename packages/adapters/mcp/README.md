# @consensus-tools/mcp

Model Context Protocol (MCP) server for consensus-tools.

## Install

```bash
pnpm add @consensus-tools/mcp
```

## Usage

```typescript
import { createMcpServer, startMcpServer } from "@consensus-tools/mcp";

const server = createMcpServer({
  storage,
  engine,
  ledger,
});

await startMcpServer(server);
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

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONSENSUS_STORAGE_PATH` | `~/.local/share/consensus-tools/state.json` | Path to the JSON state file |
| `CONSENSUS_AGENT_ID` | `mcp-agent` | Agent identity for consensus operations |

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

## What's included

- **`createMcpServer`** — creates an MCP server with consensus-tools capabilities
- **`startMcpServer`** — starts the MCP transport
- **`McpContext`** — context type for MCP tool handlers

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
