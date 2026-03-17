# @consensus-tools/integrations

GitHub and Linear adapters for consensus-tools. Fetch PR data via the `gh` CLI, verify webhook signatures, and manage Linear tasks.

## Install

```bash
pnpm add @consensus-tools/integrations
```

### Prerequisites

- **GitHub**: The `gh` CLI must be installed and authenticated (`gh auth login`).
- **Linear**: Install `@linear/sdk` as a peer dependency (`pnpm add @linear/sdk`).

## GitHub -- Fetch Pull Requests

```typescript
import { fetchPullRequest, listOpenPullRequests } from "@consensus-tools/integrations";

// Fetch a single PR (includes diff, file list, author)
const pr = fetchPullRequest("org/repo", 42);
// => { number: 42, title: "...", author: "alice", url: "...", diff: "...", files: ["src/index.ts"] }
// Note: diff is truncated to 15,000 chars

// List open PRs
const prs = listOpenPullRequests("org/repo", 20);
// => [{ number, title, author }, ...]
```

## GitHub -- Verify Webhook Signatures

```typescript
import { verifyWebhookSignature } from "@consensus-tools/integrations";

const valid = verifyWebhookSignature(rawBody, req.headers["x-hub-signature-256"], webhookSecret);
if (!valid) throw new Error("Invalid signature");
```

## Linear -- Task Management

```typescript
import { createLinearClient } from "@consensus-tools/integrations";

const linear = await createLinearClient("lin_api_abc123");

// Get unassigned tasks for a team
const tasks = await linear.getUnassignedTasks("team-id", 10);
// => [{ id, title, state, assigneeId, teamId }]

// Get team members
const members = await linear.getTeamMembers("team-id");
// => [{ id, name, email }]

// Create a subtask under a parent issue
const sub = await linear.createSubtask("parent-issue-id", "Subtask title", "assignee-id");
// => { id: "..." }

// Assign a task
await linear.assignTask("task-id", "assignee-id");
```

## Exports Reference

| Export | Kind | Description |
|---|---|---|
| `fetchPullRequest` | Function | `(repo, prNumber) => PullRequest` -- uses `gh` CLI |
| `listOpenPullRequests` | Function | `(repo, limit?) => Array<{ number, title, author }>` |
| `verifyWebhookSignature` | Function | `(payload, signature, secret) => boolean` -- HMAC-SHA256 |
| `PullRequest` | Type | `{ number, title, author, url, diff, files }` |
| `createLinearClient` | Function | `(apiKey) => Promise<LinearClient>` |
| `LinearClient` | Type | Interface with `getUnassignedTasks`, `getTeamMembers`, `createSubtask`, `assignTask` |
| `LinearTask` | Type | `{ id, title, state, assigneeId, teamId }` |
| `LinearTeamMember` | Type | `{ id, name, email }` |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
