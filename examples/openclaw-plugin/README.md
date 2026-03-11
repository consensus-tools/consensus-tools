# OpenClaw Plugin Example

The `@consensus-tools/openclaw` package registers as an OpenClaw plugin automatically.

```json
// openclaw.config.json
{
  "plugins": {
    "entries": {
      "consensus-tools": {
        "enabled": true,
        "config": {
          "mode": "local",
          "local": {
            "storage": { "kind": "json", "path": "./.openclaw/consensus-tools.json" }
          }
        }
      }
    }
  }
}
```

The plugin exposes tools like `consensus-tools_post_job`, `consensus-tools_list_jobs`, `consensus-tools_submit`, `consensus-tools_vote`, and `consensus-tools_status`.
