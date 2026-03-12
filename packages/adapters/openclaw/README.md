# @consensus-tools/openclaw

OpenClaw plugin for consensus-tools — register consensus capabilities as OpenClaw tools.

## Install

```bash
pnpm add @consensus-tools/openclaw
```

## Usage

```typescript
import { register, createService } from "@consensus-tools/openclaw";

// Register the consensus-tools plugin
register();

// Or create a service backend
const service = createService({ storage, engine });
```

## What's included

- **`register`** — plugin registration entry point
- **`registerTools`** — register individual tools with OpenClaw
- **`createService` / `createBackend`** — service layer for the plugin
- **Config** — `loadConfig`, `resolveAgentId`, `PLUGIN_ID`

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
