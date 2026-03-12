# @consensus-tools/telemetry

Observability layer for consensus-tools — traces, events, and local sinks.

## Install

```bash
pnpm add @consensus-tools/telemetry
```

## Usage

```typescript
import { EventBuffer, ConsoleSink, createSpan, closeSpan } from "@consensus-tools/telemetry";

const buffer = new EventBuffer();
buffer.addSink(new ConsoleSink());

const span = createSpan("job.resolve");
// ... do work ...
closeSpan(span);
```

## What's included

- **Event buffering** — `EventBuffer`, `createEvent`
- **Tracing** — `createSpan`, `closeSpan`
- **Sinks** — `ConsoleSink`, `FileSink`, `Sink` interface
- **Privacy** — `redact` utility for scrubbing sensitive data

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
