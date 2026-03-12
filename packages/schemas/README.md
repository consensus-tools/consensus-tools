# @consensus-tools/schemas

Shared Zod schemas and TypeScript types for the consensus-tools ecosystem.

## Install

```bash
pnpm add @consensus-tools/schemas
```

## Usage

```typescript
import { jobSchema, Job, consensusPolicyConfigSchema } from "@consensus-tools/schemas";

// Validate a job object
const job = jobSchema.parse(rawData);

// Use typed enums
import type { JobStatus, GuardDecision, HitlMode } from "@consensus-tools/schemas";
```

## What's included

- **Job lifecycle** — `jobSchema`, `submissionSchema`, `voteSchema`, `resolutionSchema`
- **Guard system** — `guardPolicySchema`, `guardEvaluateInputSchema`, `guardResultSchema`
- **Workflows** — `workflowSchema`, `workflowRunSchema`, `cronScheduleSchema`
- **HITL** — `hitlApprovalSchema`, `humanDecisionSchema`
- **Config** — `consensusToolsConfigSchema`
- **Telemetry** — `telemetryEventSchema`, `traceSpanSchema`
- **Input validation** — `jobPostInputSchema`, `voteInputSchema`, `resolveInputSchema`

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
