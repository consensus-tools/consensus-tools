import { z } from "zod";
import { jobSchema } from "./job.js";
import { bidSchema, assignmentSchema, auditEventSchema, diagnosticEntrySchema } from "./common.js";
import { submissionSchema } from "./submission.js";
import { voteSchema } from "./vote.js";
import { resolutionSchema } from "./resolution.js";
import { ledgerEntrySchema } from "./ledger.js";
import { agentSchema } from "./agent.js";
import { participantSchema } from "./participant.js";
import { workflowSchema, workflowRunSchema, cronScheduleSchema } from "./workflow.js";
import { hitlApprovalSchema } from "./hitl.js";
import { guardResultSchema } from "./guard.js";
import { policyAssignmentSchema, consensusVoteSchema } from "./policy-assignment.js";

// ── Storage State ───────────────────────────────────────────────────
//
// Two parallel consensus paths populate this state:
//
// 1. **Job path** (JobEngine): post → claim → submit → vote → resolve
//    Populates: jobs, bids, claims, submissions, votes, resolutions, ledger
//
// 2. **Workflow path** (WorkflowRunner → NodeExecutor): trigger → agent → guard → hitl → action
//    Populates: workflows, workflowRuns, participants, consensusVotes, guardResults, resolutions, ledger
//
// Shared by both paths: audit, errors, agents, hitlApprovals, policyAssignments
//
// `votes` = job submission voting (Vote type, tied to JobEngine lifecycle)
// `consensusVotes` = workflow agent verdicts (ConsensusVote type, tied to WorkflowRunner)
// `resolutions` = final consensus outcomes from either path (jobId for jobs, runId for workflows)

export const storageStateSchema = z.object({
  /** Job definitions — created by JobEngine.postJob() or as board placeholders */
  jobs: z.array(jobSchema),
  /** Stake bids on jobs — JobEngine path only */
  bids: z.array(bidSchema),
  /** Job claim assignments — JobEngine path only */
  claims: z.array(assignmentSchema),
  /** Agent submissions to jobs — JobEngine path only */
  submissions: z.array(submissionSchema),
  /** Job submission votes — JobEngine path only (see consensusVotes for workflow votes) */
  votes: z.array(voteSchema),
  /** Consensus outcomes — from both JobEngine.resolveJob() and workflow guard nodes */
  resolutions: z.array(resolutionSchema),
  /** Economic ledger — stakes, payouts, slashes (jobs) and workflow fees (workflows) */
  ledger: z.array(ledgerEntrySchema),
  audit: z.array(auditEventSchema),
  errors: z.array(diagnosticEntrySchema),
  agents: z.array(agentSchema),
  /** Board participants — registered via workflow agent nodes or manually */
  participants: z.array(participantSchema),
  workflows: z.array(workflowSchema),
  workflowRuns: z.array(workflowRunSchema),
  cronSchedules: z.array(cronScheduleSchema),
  hitlApprovals: z.array(hitlApprovalSchema),
  /** Guard evaluation results — from both GuardEngine.evaluate() and workflow guard nodes */
  guardResults: z.array(guardResultSchema),
  /** Policy-to-board bindings — controls weighting mode for guard consensus */
  policyAssignments: z.array(policyAssignmentSchema),
  /** Workflow agent verdicts — NOT the same as votes[] (see comment above) */
  consensusVotes: z.array(consensusVoteSchema),
});
export type StorageState = z.infer<typeof storageStateSchema>;
