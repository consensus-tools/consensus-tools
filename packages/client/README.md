# @consensus-tools/client

HTTP client for remote [consensus-tools](https://github.com/consensus-tools/consensus-tools) board API.

[![npm](https://img.shields.io/npm/v/@consensus-tools/client)](https://www.npmjs.com/package/@consensus-tools/client)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/client
```

## Usage

```typescript
import { ConsensusToolsClient } from "@consensus-tools/client";

const client = new ConsensusToolsClient({
  baseUrl: "http://localhost:9888",
  authToken: "your-token",
});

const jobs = await client.listJobs();
const job = await client.postJob("agent-1", {
  title: "Review content",
  reward: 10,
});
```

## Key Exports

- **`ConsensusToolsClient`** — async HTTP client for remote boards
- Types: `ClientOptions`, `JobPostInput`, `ClaimInput`, `SubmitInput`, `VoteInput`, `ResolveInput`

## Documentation

See the [consensus-tools monorepo](https://github.com/consensus-tools/consensus-tools) for full documentation.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
