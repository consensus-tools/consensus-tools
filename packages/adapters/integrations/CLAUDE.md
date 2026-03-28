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
