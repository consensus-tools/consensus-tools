# @consensus-tools/mcp

Model Context Protocol (MCP) server adapter for [consensus-tools](https://github.com/consensus-tools/consensus-tools). Exposes consensus operations as MCP tools for LLM agents.

[![npm](https://img.shields.io/npm/v/@consensus-tools/mcp)](https://www.npmjs.com/package/@consensus-tools/mcp)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/mcp
```

## Usage

```typescript
import { McpServerAdapter } from "@consensus-tools/mcp";

const adapter = new McpServerAdapter({
  board,       // LocalBoard instance from @consensus-tools/core
  agentId: "mcp-agent",
});

// Adapter exposes consensus tools via MCP protocol
```

## Key Exports

- **`McpServerAdapter`** — MCP protocol server exposing consensus tools
- **`mcpToolDefinitions`** — tool definitions for LLM agent integration

## Documentation

See the [consensus-tools monorepo](https://github.com/consensus-tools/consensus-tools) for full documentation.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
