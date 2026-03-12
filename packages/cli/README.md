# @consensus-tools/cli

CLI for consensus-tools — init projects, manage jobs, and view traces.

## Install

```bash
pnpm add -g @consensus-tools/cli
```

## Usage

```bash
# Initialize a new consensus project
consensus-tools init

# List jobs
consensus-tools jobs list

# View traces
consensus-tools traces
```

## Programmatic API

```typescript
import { buildProgram, loadCliConfig } from "@consensus-tools/cli";

const program = buildProgram();
program.parse(process.argv);
```

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
