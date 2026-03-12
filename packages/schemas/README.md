# @consensus-tools/schemas

Zod schemas and TypeScript types — the contract layer for [consensus-tools](https://github.com/consensus-tools/consensus-tools).

[![npm](https://img.shields.io/npm/v/@consensus-tools/schemas)](https://www.npmjs.com/package/@consensus-tools/schemas)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)

## Install

```bash
pnpm add @consensus-tools/schemas
```

## What it does

Every package in the monorepo depends on these schemas. They define the shape of jobs, submissions, votes, resolutions, guards, policies, workflows, HITL approvals, and storage state. All exports include both Zod schemas (for runtime validation) and inferred TypeScript types.

## Usage

```typescript
import { jobSchema, type Job, type Submission, type Vote } from "@consensus-tools/schemas";

// Runtime validation
const result = jobSchema.safeParse(data);
if (result.success) {
  console.log(result.data.title, result.data.status);
}

// Type-only imports
import type { GuardPolicy, GuardDecision, HitlApproval } from "@consensus-tools/schemas";
```

## API

| Category | Key exports |
|----------|-------------|
| **Jobs** | `Job`, `JobMode`, `JobStatus`, `JobConstraints`, `EscrowPolicy` |
| **Submissions** | `Submission`, `SubmissionStatus` |
| **Voting** | `Vote`, `VoteTargetType` |
| **Resolution** | `Resolution` |
| **Policies** | `ConsensusPolicyType`, `ConsensusPolicyConfig`, `ApprovalVoteConfig`, `SlashingPolicy`, `PolicyResolver`, `ConsensusInput`, `ConsensusResult` |
| **Ledger** | `LedgerEntry`, `LedgerEntryType` |
| **Guards** | `GuardType`, `GuardDecision`, `GuardVote`, `WeightedGuardVote`, `GuardPolicy`, `GuardEvaluateInput`, `GuardResult`, `WeightingMode`, `VoteTally` |
| **Agents** | `Agent`, `AgentConfig`, `AgentKind`, `AgentStatus` |
| **Participants** | `Participant`, `ParticipantSubjectType`, `ParticipantStatus` |
| **Workflows** | `Workflow`, `WorkflowStatus`, `WorkflowRun`, `CronSchedule` |
| **HITL** | `HitlApproval`, `HitlMode`, `HitlStatus`, `HumanDecision` |
| **Policy Assignment** | `PolicyAssignment`, `ConsensusVote` |
| **Storage** | `StorageState` |
| **Config** | `ConsensusToolsConfig` |
| **Telemetry** | `TelemetryEvent`, `TelemetryEventType`, `TraceSpan` |
| **Common** | `AuditEvent`, `Bid`, `Assignment`, `DiagnosticEntry`, `ClaimStatus` |

## How it fits

Tier 0 package. Zero internal dependencies. Every other package in the monorepo depends on schemas.

## License

[Apache-2.0](https://github.com/consensus-tools/consensus-tools/blob/main/LICENSE)
