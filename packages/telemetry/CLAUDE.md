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
