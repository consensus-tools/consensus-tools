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

// ── Storage State ───────────────────────────────────────────────────

export const storageStateSchema = z.object({
  jobs: z.array(jobSchema),
  bids: z.array(bidSchema),
  claims: z.array(assignmentSchema),
  submissions: z.array(submissionSchema),
  votes: z.array(voteSchema),
  resolutions: z.array(resolutionSchema),
  ledger: z.array(ledgerEntrySchema),
  audit: z.array(auditEventSchema),
  errors: z.array(diagnosticEntrySchema),
  agents: z.array(agentSchema),
  participants: z.array(participantSchema),
  workflows: z.array(workflowSchema),
  workflowRuns: z.array(workflowRunSchema),
  cronSchedules: z.array(cronScheduleSchema),
  hitlApprovals: z.array(hitlApprovalSchema),
  guardResults: z.array(guardResultSchema),
});
export type StorageState = z.infer<typeof storageStateSchema>;
