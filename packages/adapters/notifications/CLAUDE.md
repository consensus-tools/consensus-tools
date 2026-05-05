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

## Code Style

- Each channel (Slack/Teams/Discord/Telegram/webhook) gets its own `send*DM` function. **No abstract base class.** Channels diverge on payload format, retry policy, and error shape — concrete is clearer than generic.
- `nullCredentials` writes to stdout. It's the testing harness AND the safe default when credentials are missing — never throw on missing creds, route to null instead.
- Webhook fallback runs after primary channel failure. Log the primary error with full context **before** falling back, so on-call can see why the primary failed.
- Network errors must not leak credentials. Sanitize URLs in error messages — Slack/Teams webhooks contain auth tokens.
- Prompt modes (yes-no, approve-reject-revise, acknowledge, vote) define the response shape. Don't add new modes without a parser update — silent default-mode parsing is the worst kind of bug.
