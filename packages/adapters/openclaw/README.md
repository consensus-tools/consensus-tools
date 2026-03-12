# @consensus-tools/openclaw

OpenClaw plugin adapter for [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/openclaw)](https://www.npmjs.com/package/@consensus-tools/openclaw)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
openclaw plugins install @consensus-tools/openclaw
```

Or manually:

```bash
pnpm add @consensus-tools/openclaw
```

## What it does

Registers consensus-tools as an OpenClaw plugin, exposing job management and consensus operations to OpenClaw agents. Handles agent identity resolution, tool registration, and service/backend lifecycle.

## Plugin configuration

```json
{
  "id": "consensus-tools",
  "name": "consensus-tools",
  "version": "0.2.0",
  "description": "Decision infrastructure for agentic systems",
  "entry": "./dist/index.js",
  "capabilities": ["tools", "cli", "service"]
}
```

## Usage

```typescript
import { register, loadConfig, createService } from "@consensus-tools/openclaw";

// Register as an OpenClaw plugin
register(openclaw);

// Or create a standalone service
const config = loadConfig();
const service = createService(config);
```

## API

| Export | Description |
|--------|-------------|
| `register(openclaw)` | OpenClaw plugin registration |
| `loadConfig()` | Load plugin configuration from environment |
| `registerTools(openclaw)` | Register consensus tools for agents |
| `createService(config)` | Create consensus service instance |
| `createBackend(config)` | Create storage backend |
| `resolveAgentId(config)` | Resolve agent identity from config |
| `PLUGIN_ID` / `defaultConfig` | Plugin constants |

## How it fits

Tier 4 package. Depends on `core`, `policies`, `schemas`, and `sdk-client`.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
