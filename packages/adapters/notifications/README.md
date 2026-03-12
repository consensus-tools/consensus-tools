# @consensus-tools/notifications

Multi-channel notification dispatch for HITL approval flows in [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/notifications)](https://www.npmjs.com/package/@consensus-tools/notifications)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/notifications
```

## What it does

Dispatches human approval requests, timeout warnings, and deadline expiry notices across 5 chat platforms. A single approval request can fan out to multiple channels simultaneously. Delivery failures are caught and logged but never block the workflow.

## Adapters

| Adapter | Function | Mention format |
|---------|----------|---------------|
| Slack | `sendSlackDM` | `@user` |
| Microsoft Teams | `sendTeamsDM` | `<at>user</at>` |
| Discord | `sendDiscordDM` | User ID or `@handle` |
| Telegram | `sendTelegramDM` | `@handle` |
| Webhook | `sendViaWebhook` | Generic HTTP POST |

## Notification types

| Function | When it fires |
|----------|---------------|
| `sendHumanApprovalPrompt` | Guard escalates to `REQUIRE_HUMAN` — includes risk %, quorum, and deadline |
| `sendTimeoutWarning` | 75% of approval timeout has elapsed |
| `sendDeadlineExpired` | Timeout reached, auto-decision applied |

## Usage

```typescript
import { sendHumanApprovalPrompt, sendSlackDM } from "@consensus-tools/notifications";

await sendHumanApprovalPrompt({
  target: { channel: "slack", handle: "@reviewer" },
  runId: "run_abc123",
  riskPercent: 82,
  quorum: 0.7,
  deadlineMinutes: 5,
  credentials: credentialProvider,
});
```

## API

| Export | Description |
|--------|-------------|
| `sendHumanApprovalPrompt(opts)` | Dispatch approval request to a chat target |
| `sendTimeoutWarning(opts)` | Send timeout warning notification |
| `sendDeadlineExpired(opts)` | Send deadline expiry notification |
| `formatMention(target)` | Format a mention string for a given platform |
| `sendSlackDM` / `sendTeamsDM` / `sendDiscordDM` / `sendTelegramDM` / `sendViaWebhook` | Platform-specific send functions |
| `nullCredentials` | No-op credential provider for testing |

## How it fits

Tier 1 package. Depends on `@consensus-tools/schemas`. Used by `workflows` (HITL nodes) and `sdk-node` (webhook handlers).

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
