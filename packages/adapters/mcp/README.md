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

## What's included

- **`createMcpServer`** — creates an MCP server with consensus-tools capabilities
- **`startMcpServer`** — starts the MCP transport
- **`McpContext`** — context type for MCP tool handlers

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
