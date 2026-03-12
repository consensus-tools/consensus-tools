# @consensus-tools/telemetry

Observability layer for [consensus-tools](https://github.com/consensus-tools/consensus-tools) — traces, events, and local sinks.

[![npm](https://img.shields.io/npm/v/@consensus-tools/telemetry)](https://www.npmjs.com/package/@consensus-tools/telemetry)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/telemetry
```

## What it does

Captures structured events and trace spans from consensus operations. Events are buffered and flushed to pluggable sinks (console, file, or custom). Sensitive data can be redacted before emission. Used by the CLI and local-board for runtime observability.

## Event types

The system emits events for key decision points:

| Event | When |
|-------|------|
| `AGENT_VERDICT` | An evaluator casts a guard vote |
| `RISK_SCORE` | Combined risk score computed |
| `CONSENSUS_QUORUM` | Quorum threshold checked |
| `FINAL_DECISION` | Guard produces ALLOW/BLOCK/REWRITE/REQUIRE_HUMAN |
| `WORKFLOW_START` / `WORKFLOW_COMPLETE` | Workflow lifecycle |
| `HITL_PENDING` / `HITL_RESOLVED` | Human approval lifecycle |

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

## API

| Export | Description |
|--------|-------------|
| `EventBuffer` | Buffered event collection with flush |
| `createSpan(name, meta)` / `closeSpan(span)` | Trace span lifecycle |
| `createEvent(type, data)` | Create a structured telemetry event |
| `ConsoleSink` | Log events to stdout |
| `FileSink` | Write events to a file |
| `redact(data)` | Strip sensitive fields (tokens, keys) from event data |

## How it fits

Tier 1 package. Depends on `@consensus-tools/schemas`. Used by `cli` and `local-board`.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
