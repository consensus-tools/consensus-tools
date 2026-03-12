# @consensus-tools/integrations

External platform adapters for GitHub and Linear in [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/integrations)](https://www.npmjs.com/package/@consensus-tools/integrations)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/integrations
```

## What it does

Provides typed adapters for fetching data from GitHub and Linear. Used by workflow nodes to trigger on GitHub PRs, fetch Linear tasks for decomposition, and verify incoming webhooks.

## GitHub

Requires the `gh` CLI to be installed and authenticated.

```typescript
import { fetchPullRequest, listOpenPullRequests, verifyWebhookSignature } from "@consensus-tools/integrations";

const pr = await fetchPullRequest("owner/repo", 42);
// pr → { number, title, author, files, diff, ... }

const prs = await listOpenPullRequests("owner/repo");

const valid = verifyWebhookSignature(payload, signature, secret);
```

## Linear

Requires a Linear API key.

```typescript
import { createLinearClient } from "@consensus-tools/integrations";

const linear = createLinearClient({ apiKey: "lin_api_..." });
// linear → { getTask, getUnassignedTasks, getTeamMembers, assignTask, ... }
```

## API

| Export | Description |
|--------|-------------|
| `fetchPullRequest(repo, number)` | Fetch PR details including files and diff |
| `listOpenPullRequests(repo)` | List open PRs for a repository |
| `verifyWebhookSignature(payload, sig, secret)` | Verify GitHub webhook HMAC signature |
| `createLinearClient(config)` | Create a typed Linear API client |
| `PullRequest` | PR type definition |
| `LinearClient` / `LinearTask` / `LinearTeamMember` | Linear type definitions |

## How it fits

Tier 1 package. Depends on `@consensus-tools/schemas`. Used by `workflows` (trigger and action nodes) and `sdk-node` (webhook handlers).

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
