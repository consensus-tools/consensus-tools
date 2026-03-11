# consensus-tools

> Decision infrastructure for agentic systems — locally-run, deterministic, and observable.

A monorepo providing the building blocks for multi-agent consensus: job boards, policy resolution, staking, ledgers, and telemetry.

## Packages

| Package | Description |
|---------|-------------|
| [`@consensus-tools/schemas`](packages/schemas) | Zod schemas and TypeScript types — the shared contract layer |
| [`@consensus-tools/core`](packages/core) | Job engine, ledger, storage, and resolution logic |
| [`@consensus-tools/policies`](packages/policies) | 9 built-in consensus policy implementations + registry |
| [`@consensus-tools/wrapper`](packages/wrapper) | Runtime decision firewall — wraps any function with consensus gates |
| [`@consensus-tools/telemetry`](packages/telemetry) | Traces, events, buffered sinks for observability |
| [`@consensus-tools/client`](packages/client) | HTTP client for remote board API |
| [`@consensus-tools/openclaw`](packages/openclaw) | OpenClaw plugin adapter |
| [`@consensus-tools/mcp`](packages/mcp) | Model Context Protocol server adapter |
| [`@consensus-tools/node`](packages/node) | Node.js HTTP server for local board |
| [`@consensus-tools/cli`](packages/cli) | CLI — init, manage jobs, view traces |

## Apps

| App | Description |
|-----|-------------|
| [`apps/api`](apps/api) | Standalone API server |
| [`apps/web`](apps/web) | Web dashboard (placeholder) |

## Examples

| Example | Description |
|---------|-------------|
| [`next-api-route`](examples/next-api-route) | Using core in a Next.js API route |
| [`openclaw-plugin`](examples/openclaw-plugin) | OpenClaw plugin configuration |
| [`mcp-server`](examples/mcp-server) | MCP server for LLM agents |
| [`background-worker`](examples/background-worker) | Long-running worker polling for jobs |

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Type-check
pnpm typecheck

# Run tests
pnpm test
```

## Architecture

```
schemas → core → policies
           ↓         ↓
        wrapper    openclaw
           ↓         ↓
         mcp       node
           ↓         ↓
          cli      api (app)
```

**schemas** has zero internal dependencies. **core** depends only on schemas. Everything else depends on core + schemas.

## Design Principles

- **Local-first**: Everything runs on one machine by default. No network calls unless you opt in.
- **Deterministic**: Same inputs → same resolution. Pure policy functions, no hidden state.
- **Observable**: Every decision produces a trace. Telemetry is optional but first-class.
- **Sharp boundaries**: Each package has a single responsibility with clean imports.

## Migration from v0.2.0

See [MIGRATION.md](MIGRATION.md) for a guide on migrating from the monolithic `@consensus-tools/consensus-tools@0.2.0`.

## License

MIT
