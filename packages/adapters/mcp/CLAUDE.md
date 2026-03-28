# @consensus-tools/mcp

MCP server exposing 24 consensus-tools as Model Context Protocol tools, resources, and prompts.

## Key Exports

- `createMcpServer(ctx: McpContext)` — creates MCP server instance
- `startMcpServer()` — CLI entry point (bin: `consensus-tools-mcp`)

## Architecture

- Tool prefixes: `board.*`, `run.*`, `audit.*`, `human.*`, `workflow.*`, `cron.*`, `agent.*`, `consensus_*`, `policy.*`, `guard.*`
- Depends on `@modelcontextprotocol/sdk` (>= 1.0.0)

## Gotchas

- Adding a new tool requires updating both the tools array and the handler namespace.
- Env vars: `CONSENSUS_STORAGE_PATH` (respects `$XDG_DATA_HOME`, defaults to `~/.local/share/consensus-tools/state.json`), `CONSENSUS_AGENT_ID` (default `mcp-agent`).
