# @consensus-tools/integrations

External platform adapters for GitHub and Linear.

## Key Exports

- GitHub: `fetchPullRequest()`, `listOpenPullRequests()`, `verifyWebhookSignature()`
- Linear: `createLinearClient(apiKey)` with `getUnassignedTasks()` etc.

## Gotchas

- **GitHub integration requires `gh` CLI** installed and authenticated on PATH.
- Linear requires `@linear/sdk` as an optional peer dependency.
- PR diffs are truncated to 15,000 characters.
- No test script — compile-only (build + typecheck).

## Code Style

- GitHub calls go through the `gh` CLI via `child_process.spawn`. Surface failures as descriptive `Error`s with the exit code preserved on `.cause` — don't swallow stderr.
- PR diffs truncate at 15,000 chars with an explicit `[truncated]` marker so callers know data was cut. Never silently drop content.
- Webhook signature verification runs **before** parsing the body. Bail with HTTP 401 on mismatch; partial-trust is worse than rejection.
- Linear SDK is an optional peer — check `client` is non-null before any operation, throw a clear "Linear not configured" error if missing.
- Never log full webhook payloads — they contain identifiers tied to user data. Log event type + entity ID only.
