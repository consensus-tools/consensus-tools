# @consensus-tools/schemas

Shared Zod schemas and TypeScript types for the consensus-tools monorepo. This package is the contract layer -- every other package depends on it and it has zero internal dependencies.

## Install

```bash
pnpm add @consensus-tools/schemas
```

## Basic Usage

Validate untrusted data at runtime using any exported Zod schema:

```typescript
import { jobSchema, type Job } from "@consensus-tools/schemas";

const job: Job = jobSchema.parse(untrustedPayload); // throws ZodError on invalid data
```

Use the TypeScript types alone (zero runtime cost) for typed function signatures:

```typescript
import type { GuardDecision, JobStatus, HitlMode } from "@consensus-tools/schemas";

function handleDecision(d: GuardDecision): void {
  if (d === "BLOCK") { /* ... */ }
}
```

## Validate API Inputs

Each API endpoint has a matching input schema:

```typescript
import { jobPostInputSchema, voteInputSchema } from "@consensus-tools/schemas";

const body = jobPostInputSchema.parse(req.body); // safe to use
const vote = voteInputSchema.parse(req.body);
```

## Policy Configuration

```typescript
import { consensusPolicyConfigSchema, type ConsensusPolicyConfig } from "@consensus-tools/schemas";

const policy: ConsensusPolicyConfig = consensusPolicyConfigSchema.parse({
  type: "APPROVAL_VOTE",
  quorum: 3,
  minMargin: 0.6,
  approvalVote: { weightMode: "reputation", settlement: "staked" },
});
```

Available policy types: `FIRST_SUBMISSION_WINS`, `HIGHEST_CONFIDENCE_SINGLE`, `APPROVAL_VOTE`, `OWNER_PICK`, `TOP_K_SPLIT`, `MAJORITY_VOTE`, `WEIGHTED_VOTE_SIMPLE`, `WEIGHTED_REPUTATION`, `TRUSTED_ARBITER`.

## Guard Schemas

```typescript
import { guardEvaluateInputSchema, guardResultSchema, type GuardResult } from "@consensus-tools/schemas";
import { parseHumanApprovalYesNo } from "@consensus-tools/schemas";

const input = guardEvaluateInputSchema.parse(raw);
const approved = parseHumanApprovalYesNo("yes"); // true
```

## Exports Reference

| Domain | Schemas | Types |
|---|---|---|
| Policy | `consensusPolicyTypeSchema`, `approvalVoteConfigSchema`, `consensusPolicyConfigSchema`, `slashingPolicySchema` | `ConsensusPolicyType`, `ApprovalVoteConfig`, `ConsensusPolicyConfig`, `SlashingPolicy` |
| Job | `jobModeSchema`, `jobStatusSchema`, `jobConstraintsSchema`, `escrowPolicySchema`, `jobSchema` | `JobMode`, `JobStatus`, `JobConstraints`, `EscrowPolicy`, `Job` |
| Submission | `submissionStatusSchema`, `submissionSchema` | `SubmissionStatus`, `Submission` |
| Vote | `voteTargetTypeSchema`, `voteSchema` | `VoteTargetType`, `Vote` |
| Resolution | `resolutionSchema` | `Resolution` |
| Ledger | `ledgerEntryTypeSchema`, `ledgerEntrySchema` | `LedgerEntryType`, `LedgerEntry` |
| Guard | `guardTypeSchema`, `guardDecisionSchema`, `guardVoteValueSchema`, `guardVoteSchema`, `weightedGuardVoteSchema`, `guardPolicySchema`, `guardEvaluateInputSchema`, `guardEvaluateRequestSchema`, `guardResultSchema`, `weightingModeSchema`, `humanApprovalRequestSchema` | Matching types + `VoteTally`, `parseHumanApprovalYesNo` |
| Agent | `agentKindSchema`, `agentStatusSchema`, `agentSchema`, `agentConfigSchema` | `AgentKind`, `AgentStatus`, `Agent`, `AgentConfig` |
| Participant | `participantSubjectTypeSchema`, `participantStatusSchema`, `participantSchema` | `ParticipantSubjectType`, `ParticipantStatus`, `Participant` |
| Workflow | `workflowStatusSchema`, `workflowSchema`, `workflowRunSchema`, `cronScheduleSchema` | `WorkflowStatus`, `Workflow`, `WorkflowRun`, `CronSchedule` |
| HITL | `hitlModeSchema`, `hitlStatusSchema`, `hitlApprovalSchema`, `humanDecisionSchema` | `HitlMode`, `HitlStatus`, `HitlApproval`, `HumanDecision` |
| Telemetry | `telemetryEventTypeSchema`, `telemetryEventSchema`, `traceSpanSchema` | `TelemetryEventType`, `TelemetryEvent`, `TraceSpan` |
| Config | `consensusToolsConfigSchema` | `ConsensusToolsConfig` |
| Storage | `storageStateSchema` | `StorageState` |
| Common | `claimStatusSchema`, `bidSchema`, `assignmentSchema`, `auditEventSchema`, `diagnosticEntrySchema` | `ClaimStatus`, `Bid`, `Assignment`, `AuditEvent`, `DiagnosticEntry` |
| Inputs | `jobPostInputSchema`, `claimInputSchema`, `submitInputSchema`, `voteInputSchema`, `resolveInputSchema`, `workflowCreateInputSchema`, `cronRegisterInputSchema`, `participantCreateInputSchema`, `consensusVoteInputSchema` | Matching types |
| Policy Assignment | `policyAssignmentSchema`, `consensusVoteSchema` | `PolicyAssignment`, `ConsensusVote` |
| Resolver | -- | `ConsensusInput`, `ConsensusResult`, `PolicyResolver` |

## Links

[consensus-tools on GitHub](https://github.com/consensus-tools/consensus-tools)
