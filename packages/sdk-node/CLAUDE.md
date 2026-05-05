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

## Code Style

- Best-effort handlers (HITL resume, `recordError`, telemetry) wrap calls in `try { ... } catch { /* ignore */ }` with a one-line comment explaining why failure is tolerable. Auxiliary work must never fail the request.
- Errors with a `statusCode` field propagate it to the response; everything else is a 500 with the message in the body.
- Validate every JSON body with the matching Zod schema and reply 400 with `error.issues` on failure. Never trust client input past the schema boundary.
- Webhook signatures verified before parsing the body. Bail with 401 on mismatch — never partial-trust.
- Don't log raw secrets or full request bodies. Webhook payloads can contain PII; log identifiers, not contents.
- Use the Node.js `http` module directly. No Express, no middleware framework — keep the dependency footprint thin.
