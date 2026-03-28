# @consensus-tools/sdk-node

HTTP server exposing the full consensus-tools protocol as REST API with webhooks.

## Key Exports

- `ConsensusToolsServer` — constructor takes `ServerDeps` with all engines pre-initialized

## Architecture

- Uses Node.js `http` module directly (not Express).
- Webhook handlers for GitHub, Linear, Slack, Teams, Discord, Telegram.
- Rate limiting via sliding window.
- Workflow + cron scheduler integration.

## Gotchas

- Heaviest dependency set in the monorepo — requires core, storage, guards, workflows, integrations, secrets, notifications, schemas, policies all initialized.
- WorkflowRunner and CronScheduler are async dependencies passed in constructor.
- Webhook signatures validated per platform.
