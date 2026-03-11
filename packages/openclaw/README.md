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

## Usage

```typescript
import { register, loadConfig, createService } from "@consensus-tools/openclaw";

// Register as an OpenClaw plugin
register(openclaw);

// Or create a standalone service
const config = loadConfig();
const service = createService(config);
```

## Key Exports

- **`register()`** — OpenClaw plugin registration
- **`loadConfig()`** — load plugin configuration
- **`registerTools()`** — register consensus tools for agents
- **`createService()` / `createBackend()`** — service and backend factories
- **`resolveAgentId()`** — resolve agent identity from config

## Documentation

See the [consensus-tools monorepo](https://github.com/consensus-tools/consensus-tools) for full documentation.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
