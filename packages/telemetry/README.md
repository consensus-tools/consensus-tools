# @consensus-tools/telemetry

Observability layer for [consensus-tools](https://github.com/consensus-tools/consensus-tools) — traces, events, and local sinks.

[![npm](https://img.shields.io/npm/v/@consensus-tools/telemetry)](https://www.npmjs.com/package/@consensus-tools/telemetry)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/telemetry
```

## Usage

```typescript
import { EventBuffer, createSpan, closeSpan, ConsoleSink } from "@consensus-tools/telemetry";

const buffer = new EventBuffer();
const sink = new ConsoleSink();

const span = createSpan("resolve-job", { jobId: "job_123" });
// ... do work ...
closeSpan(span);

buffer.flush(sink);
```

## Key Exports

- **`EventBuffer`** — buffered event collection
- **`createSpan()` / `closeSpan()`** — trace span lifecycle
- **`createEvent()`** — create telemetry events
- **`ConsoleSink`** / **`FileSink`** — local telemetry sinks
- **`redact()`** — sanitize sensitive data from events

## Documentation

See the [consensus-tools monorepo](https://github.com/consensus-tools/consensus-tools) for full documentation.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
