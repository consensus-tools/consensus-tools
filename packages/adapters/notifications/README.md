# @consensus-tools/notifications

Multi-channel notification dispatch for consensus-tools — Slack, Teams, Discord, Telegram, and webhooks.

## Install

```bash
pnpm add @consensus-tools/notifications
```

## Usage

```typescript
import { sendHumanApprovalPrompt, sendSlackDM } from "@consensus-tools/notifications";

// Send HITL approval prompt to the appropriate channel
await sendHumanApprovalPrompt(target, prompt, credentials);

// Or send directly to Slack
await sendSlackDM({ channel: "U12345", text: "Please review" }, token);
```

## What's included

- **Dispatch** — `sendHumanApprovalPrompt`, `sendTimeoutWarning`, `sendDeadlineExpired`
- **Channel adapters** — `sendSlackDM`, `sendTeamsDM`, `sendDiscordDM`, `sendTelegramDM`, `sendViaWebhook`
- **Utilities** — `formatMention`, `nullCredentials`

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
