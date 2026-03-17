# @consensus-tools/telemetry

Lightweight observability for consensus-tools. Buffer telemetry events, dispatch them to pluggable sinks, trace operations with spans, and redact sensitive metadata before export.

## Install

```bash
pnpm add @consensus-tools/telemetry
```

Peer dependency: `@consensus-tools/schemas`

## Basic Usage -- Events and Sinks

```typescript
import { EventBuffer, ConsoleSink, FileSink, createEvent } from "@consensus-tools/telemetry";

// Create a buffer with one or more sinks
const buffer = new EventBuffer([new ConsoleSink(), new FileSink("./events.ndjson")]);

// Push events into the buffer (auto-flushes at 100 events or every 5s)
buffer.push(createEvent("job.created", "job_123", { title: "Review PR" }));
buffer.push(createEvent("job.resolved", "job_123", { winner: "agent-1" }));

// Manually flush and shut down
await buffer.flush();
await buffer.close(); // clears interval, flushes, closes sinks
```

## Tracing

Create and close spans to measure operation duration:

```typescript
import { createSpan, closeSpan } from "@consensus-tools/telemetry";

const span = createSpan("job.resolve");
// ... do work ...
const finished = closeSpan(span); // sets endTime, status: "ok"

// Record errors
const errSpan = closeSpan(span, "Timeout waiting for votes");
// => status: "error", attributes: { error: "Timeout waiting for votes" }

// Nested spans
const parent = createSpan("workflow.run");
const child = createSpan("step.evaluate", parent.spanId);
```

## Redacting Sensitive Data

Strip sensitive fields (`apiKey`, `secret`, `token`, `password`, `credential`) from event metadata before export:

```typescript
import { createEvent, redact } from "@consensus-tools/telemetry";

const event = createEvent("auth.check", undefined, { user: "alice", token: "sk-abc" });
const safe = redact(event);
// safe.metadata => { user: "alice", token: "[REDACTED]" }
```

## Custom Sinks

Implement the `Sink` interface to send events anywhere:

```typescript
import type { Sink } from "@consensus-tools/telemetry";
import type { TelemetryEvent } from "@consensus-tools/schemas";

const httpSink: Sink = {
  name: "http",
  async write(event: TelemetryEvent) {
    await fetch("https://telemetry.example.com/v1/events", {
      method: "POST",
      body: JSON.stringify(event),
    });
  },
  async flush() { /* batch commit */ },
  async close() { /* cleanup */ },
};

const buffer = new EventBuffer([httpSink], 50, 10_000); // maxBuffer=50, flushInterval=10s
```

## Exports Reference

| Export | Kind | Description |
|---|---|---|
| `EventBuffer` | Class | Buffered event pipeline. Constructor: `(sinks, maxBufferSize?, flushIntervalMs?)` |
| `createEvent` | Function | `(type, jobId?, metadata?) => TelemetryEvent` |
| `createSpan` | Function | `(name, parentId?) => TraceSpan` |
| `closeSpan` | Function | `(span, error?) => TraceSpan` with `endTime` set |
| `redact` | Function | `(event) => TelemetryEvent` with sensitive fields replaced |
| `ConsoleSink` | Class | Logs `[timestamp] type jobId` to stdout |
| `FileSink` | Class | Appends NDJSON to a file. Constructor: `(path)` |
| `Sink` | Interface | `{ name, write, writeSpan?, flush?, close? }` |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
