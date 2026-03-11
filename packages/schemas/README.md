# @consensus-tools/schemas

Shared Zod schemas and TypeScript types for [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/schemas)](https://www.npmjs.com/package/@consensus-tools/schemas)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/schemas
```

## Usage

```typescript
import { Job, ConsensusToolsConfig, ConsensusPolicyType } from "@consensus-tools/schemas";

// Validate a job object with Zod
const result = Job.safeParse(data);
if (result.success) {
  console.log(result.data.title, result.data.status);
}

// Use TypeScript types
import type { Job as JobType, Submission, Vote, Resolution } from "@consensus-tools/schemas";
```

## Key Exports

- **Job model**: `Job`, `JobMode`, `JobStatus`, `JobConstraints`
- **Submissions**: `Submission`, `SubmissionStatus`
- **Voting**: `Vote`, `VoteTargetType`
- **Resolution**: `Resolution`
- **Policies**: `ConsensusPolicyType`, `ConsensusPolicyConfig`, `PolicyResolver`
- **Ledger**: `LedgerEntry`, `LedgerEntryType`
- **Config**: `ConsensusToolsConfig`
- **Telemetry**: `TelemetryEvent`, `TraceSpan`

All exports include both Zod schemas (for runtime validation) and inferred TypeScript types.

## Documentation

See the [consensus-tools monorepo](https://github.com/consensus-tools/consensus-tools) for full documentation.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
