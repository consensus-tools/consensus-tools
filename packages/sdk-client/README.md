# @consensus-tools/sdk-client

HTTP client for the consensus-tools board API.

## Install

```bash
pnpm add @consensus-tools/sdk-client
```

## Usage

```typescript
import { ConsensusToolsClient } from "@consensus-tools/sdk-client";

const client = new ConsensusToolsClient({ baseUrl: "http://localhost:3000" });

// Post a job
const job = await client.postJob({ title: "Review PR #42", mode: "open" });

// Submit, vote, resolve
await client.submit({ jobId: job.id, agentId: "agent-1", content: "LGTM" });
await client.vote({ jobId: job.id, agentId: "agent-2", submissionId: "sub-1", value: "approve" });
await client.resolve({ jobId: job.id });
```

## What's included

- **`ConsensusToolsClient`** — full HTTP client for all board endpoints
- **Types** — `ClientOptions`, `JobPostInput`, `ClaimInput`, `SubmitInput`, `VoteInput`, `ResolveInput`

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
