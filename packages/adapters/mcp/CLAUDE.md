# @consensus-tools/mcp

MCP server exposing 31 consensus-tools as Model Context Protocol tools, resources, and prompts.

## Key Exports

- `createMcpServer(ctx: McpContext)` — creates MCP server instance
- `startMcpServer()` — CLI entry point (bin: `consensus-tools-mcp`)

## Architecture

- Tool prefixes: `board.*`, `run.*`, `audit.*`, `human.*`, `workflow.*`, `cron.*`, `agent.*`, `consensus_*`, `policy.*`, `guard.*`
- Depends on `@modelcontextprotocol/sdk` (>= 1.0.0)

## Gotchas

- Adding a new tool requires updating both the tools array and the handler namespace.
- Env vars: `CONSENSUS_STORAGE_PATH` (respects `$XDG_DATA_HOME`, defaults to `~/.local/share/consensus-tools/state.json`), `CONSENSUS_AGENT_ID` (default `mcp-agent`).

## Code Style

- Adding a tool requires updating both the `tools` array and the handler namespace. Keep them aligned — MCP fails opaquely if they drift.
- Tool prefixes (`board.*`, `run.*`, `audit.*`, `human.*`, `workflow.*`, `cron.*`, `agent.*`, `consensus_*`, `policy.*`, `guard.*`) are part of the public protocol. Don't rename without a major version bump and migration notes.
- Env vars read once at startup, never per-call. Caching prevents per-tool latency hits and surprise behavior mid-session.
- Tool input/output schemas are Zod — the same schemas used elsewhere in the toolkit. Don't redeclare; import from `@consensus-tools/schemas`.
- Errors returned to MCP clients carry both a human-readable message and a stable `code`. The code is part of the contract; don't change it without coordinating with consumers.
