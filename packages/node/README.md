# @consensus-tools/node

Node.js HTTP server for [consensus-tools](https://github.com/consensus-tools/consensus-tools) local board.

[![npm](https://img.shields.io/npm/v/@consensus-tools/node)](https://www.npmjs.com/package/@consensus-tools/node)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/node
```

## Usage

```typescript
import { ConsensusToolsServer } from "@consensus-tools/node";

const server = new ConsensusToolsServer({
  board,       // LocalBoard instance from @consensus-tools/core
  host: "127.0.0.1",
  port: 9888,
  authToken: "your-token",
});

await server.start();
```

## Key Exports

- **`ConsensusToolsServer`** — HTTP server with RESTful endpoints for jobs, submissions, votes, and resolutions

## Documentation

See the [consensus-tools monorepo](https://github.com/consensus-tools/consensus-tools) for full documentation.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
