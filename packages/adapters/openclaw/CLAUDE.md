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
