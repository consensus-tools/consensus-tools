# @consensus-tools/mcp

MCP server exposing 29 consensus-tools as Model Context Protocol tools, resources, and prompts.

## Key Exports

- `createMcpServer(ctx: McpContext)` — creates MCP server instance
- `startMcpServer()` — CLI entry point (bin: `consensus-tools-mcp`)

## Architecture

- 6 tool handler namespaces: `guard.*`, `agent.*`, `consensus_*`, `human.*`, `board.|run.|audit.*`, `workflow.|cron.*`
- Depends on `@modelcontextprotocol/sdk` (>= 1.0.0)

## Gotchas

- Adding a new tool requires updating both the tools array and the handler namespace.
- Env vars: `CONSENSUS_STORAGE_PATH` (default `~/.local/share/consensus-tools/state.json`), `CONSENSUS_AGENT_ID` (default `mcp-agent`).
