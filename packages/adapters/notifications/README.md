# @consensus-tools/notifications

Multi-channel human-in-the-loop notification dispatch. Send approval prompts, timeout warnings, and deadline expiry notices to Slack, Teams, Discord, Telegram, or a generic webhook. Automatically falls back to webhook when targeted delivery fails.

## Install

```bash
pnpm add @consensus-tools/notifications
```

## Basic Usage -- Send an Approval Prompt

```typescript
import { sendHumanApprovalPrompt, nullCredentials } from "@consensus-tools/notifications";
import type { ChatPrompt } from "@consensus-tools/notifications";

const prompt: ChatPrompt = {
  boardId: "board-1",
  runId: "run-42",
  quorum: 0.6,
  risk: 0.85,
  threshold: 0.7,
  promptMode: "yes-no",          // "yes-no" | "approve-reject-revise" | "acknowledge" | "vote"
  timeoutSec: 300,
  chatTargets: [
    { subjectId: "user-1", adapter: "slack", handle: "U12345ABC" },
    { subjectId: "user-2", adapter: "discord", handle: "987654321" },
  ],
};

const result = await sendHumanApprovalPrompt(prompt, nullCredentials, "stdout");
// => { delivered: true, provider: "stdout", message: "...", promptMode: "yes-no", results: [...] }
```

## Timeout and Deadline Notifications

```typescript
import { sendTimeoutWarning, sendDeadlineExpired, nullCredentials } from "@consensus-tools/notifications";

// Warn approvers that time is running out
await sendTimeoutWarning(prompt, 120, nullCredentials); // 120 seconds remaining

// Notify that the deadline has passed with an auto-decision
await sendDeadlineExpired(prompt, "BLOCK", nullCredentials);
```

## Direct Channel Adapters

Send messages directly to a specific platform:

```typescript
import { sendSlackDM, sendDiscordDM, sendViaWebhook } from "@consensus-tools/notifications";

// Each adapter takes (target, message, meta, credentials) and returns DeliveryResult
const target = { subjectId: "user-1", adapter: "slack", handle: "U12345ABC" };
const meta = { boardId: "board-1", runId: "run-42", type: "human_approval_request" };
const result = await sendSlackDM(target, "Please review run-42", meta, credentials);
// => { target, delivered: true, provider: "slack", messageId: "1234.5678" }
```

Credentials are resolved from a `CredentialProvider` (e.g. `CredentialManager` from `@consensus-tools/secrets`) or environment variables (`SLACK_BOT_TOKEN`, `CHAT_WEBHOOK_URL`).

## Format Mentions

```typescript
import { formatMention } from "@consensus-tools/notifications";

formatMention("slack", "U12345ABC");   // "<@U12345ABC>"
formatMention("discord", "987654321"); // "<@987654321>"
formatMention("teams", "alice");       // "<at>alice</at>"
formatMention("telegram", "bob");      // "@bob"
```

## Exports Reference

| Export | Kind | Description |
|---|---|---|
| `sendHumanApprovalPrompt` | Function | `(prompt, credentials, chatProvider?) => Promise<PromptResult>` |
| `sendTimeoutWarning` | Function | `(prompt, remainingSec, credentials, chatProvider?) => Promise<PromptResult>` |
| `sendDeadlineExpired` | Function | `(prompt, autoDecision, credentials, chatProvider?) => Promise<PromptResult>` |
| `formatMention` | Function | `(adapter, handle) => string` |
| `sendSlackDM` | Function | Direct Slack DM via Bot API |
| `sendTeamsDM` | Function | Direct Teams DM |
| `sendDiscordDM` | Function | Direct Discord DM |
| `sendTelegramDM` | Function | Direct Telegram DM |
| `sendViaWebhook` | Function | Generic webhook POST |
| `nullCredentials` | Object | No-op `CredentialProvider` (returns `null` for all lookups) |
| `ChatTarget` | Type | `{ subjectId, adapter, handle }` |
| `ChatPrompt` | Type | Full prompt config (boardId, runId, quorum, risk, targets, etc.) |
| `DeliveryResult` | Type | Per-target delivery outcome |
| `PromptResult` | Type | Aggregate result with all `DeliveryResult`s |
| `CredentialProvider` | Type | `{ get(provider, keyName) => string \| null }` |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
