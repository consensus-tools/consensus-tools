# @consensus-tools/cli

CLI for [consensus-tools](https://github.com/consensus-tools/consensus-tools) — manage jobs, agents, boards, and traces from the terminal.

[![npm](https://img.shields.io/npm/v/@consensus-tools/cli)](https://www.npmjs.com/package/@consensus-tools/cli)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add -g @consensus-tools/cli
```

## Commands

```bash
# Configuration
consensus-tools config get <key>
consensus-tools config set <key> <value>

# Board management
consensus-tools board use local
consensus-tools board use remote <url>

# Jobs
consensus-tools jobs post --title "Review PR" --reward 10 --stake 5
consensus-tools jobs list [--status open] [--json]
consensus-tools jobs claim <jobId> [--stake 5]
consensus-tools jobs submit <jobId> --summary "Result" [--confidence 0.9]
consensus-tools jobs vote <jobId> --submission <subId> --score 1
consensus-tools jobs resolve <jobId>

# Agents
consensus-tools agent register --name "reviewer-1"
consensus-tools agent list
consensus-tools agent suspend <agentId>
consensus-tools agent activate <agentId>
```

## Programmatic use

```typescript
import { buildProgram, loadCliConfig, saveCliConfig, renderTable } from "@consensus-tools/cli";

const program = buildProgram();
await program.parseAsync(["node", "consensus-tools", "jobs", "list", "--json"]);
```

## API

| Export | Description |
|--------|-------------|
| `buildProgram()` | Create the Commander.js CLI program |
| `loadCliConfig()` / `saveCliConfig(config)` | Read/write CLI configuration |
| `renderTable(rows, columns)` | Format data as a table for terminal output |

## How it fits

Tier 4 package. Depends on `sdk-client`, `core`, `schemas`, and `telemetry`. Connects to a local or remote board server.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
