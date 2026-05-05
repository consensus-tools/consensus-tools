# @consensus-tools/openclaw

OpenClaw plugin adapter. Dual-mode: local (in-process) or global (remote server).

## Key Exports

- `register(api)` — standard OpenClaw plugin entry point
- `loadConfig()` / `resolveAgentId()` — config and identity resolution
- `createService()` (local) / `createBackend()` (remote)

## Gotchas

- Global mode requires `baseUrl` + `accessToken`.
- Plugin manifest: `openclaw.plugin.json`.
- 5 tools registered: `consensus-tools_post_job`, `list_jobs`, `submit`, `vote`, `status`.

## Code Style

- Config lookup is a fallback chain (`getPluginConfig` → `config.get` → direct path). Each step warns via the injected logger and falls through. Never throw from config resolution — plugin host shapes vary.
- `recordLocalError()` is best-effort — wraps engine calls in try/catch and ignores failures. Telemetry must never block the user's action.
- Local vs global mode branches stay explicit. Don't abstract them behind a single `mode === ?` ternary; readers need both flows visible to reason about safety.
- Network side effects gated by `safety.allowNetworkSideEffects` — throw a clear error before the request, don't let the network call fail with a generic message.
- Plugin manifest (`openclaw.plugin.json`) and the registered tool list must agree on tool IDs. Drift here breaks the host's tool dispatcher silently.
