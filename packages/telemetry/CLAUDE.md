# @consensus-tools/telemetry

Lightweight observability: event buffering to pluggable sinks, span tracing, and metadata redaction.

## Key Exports

- `EventBuffer` — auto-flushes at 100 events or every 5 seconds
- `createEvent(type, entityId, metadata)` / `createSpan(name)` / `closeSpan(span)`
- `redact(payload, paths)` — mask sensitive values
- Sinks: `ConsoleSink`, `FileSink` (NDJSON format)

## Gotchas

- **Must call `buffer.close()`** to flush remaining events and stop the timer.
- Redaction is path-based string masking — no deep object traversal.

## Code Style

- `EventBuffer` flushes on size (100 events) or time (5s) — never on every call. Sync flushes in hot paths defeat the buffer.
- Always call `buffer.close()` on shutdown. Pending events drop otherwise — wire `close()` into your process exit handler.
- `redact()` is path-based string masking. Explicit beats clever: pass the exact paths to mask, never auto-detect "looks like a secret."
- Sinks are pluggable; failures **inside** a sink must be caught by the sink, not propagated. A broken sink must not break event recording.
- Spans (`createSpan` / `closeSpan`) are pairs — every open must have a matching close. Use try/finally, not loose call sites.
- Don't add new sink types without considering buffering: NDJSON to disk is fine; HTTP to a remote service needs its own retry/buffer layer.
