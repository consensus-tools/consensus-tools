# @consensus-tools/integrations

GitHub and Linear integration adapters for consensus-tools.

## Install

```bash
pnpm add @consensus-tools/integrations
```

## Usage

```typescript
import { fetchPullRequest, verifyWebhookSignature } from "@consensus-tools/integrations";

// Fetch a GitHub PR
const pr = await fetchPullRequest({ owner: "org", repo: "repo", number: 42, token });

// Verify GitHub webhook
const valid = verifyWebhookSignature(payload, signature, secret);
```

```typescript
import { createLinearClient } from "@consensus-tools/integrations";

const linear = createLinearClient({ apiKey });
```

## What's included

- **GitHub** — `fetchPullRequest`, `listOpenPullRequests`, `verifyWebhookSignature`
- **Linear** — `createLinearClient`, `LinearClient`, `LinearTask`

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
