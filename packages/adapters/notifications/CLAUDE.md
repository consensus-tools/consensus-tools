# @consensus-tools/notifications

Multi-channel HITL notification dispatch: Slack, Teams, Discord, Telegram, webhook.

## Key Exports

- `sendHumanApprovalPrompt(prompt, credentials, provider)` — dispatches with webhook fallback
- `sendTimeoutWarning()` / `sendDeadlineExpired()` — lifecycle notifications
- Per-channel: `sendSlackDM`, `sendTeamsDM`, `sendDiscordDM`, `sendTelegramDM`
- `nullCredentials` — stdout delivery for testing

## Gotchas

- No test script — compile-only.
- Prompt modes: yes-no, approve-reject-revise, acknowledge, vote.
