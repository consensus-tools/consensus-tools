import { z } from "zod";
import { jobSchema } from "./job.js";
import { bidSchema, assignmentSchema, auditEventSchema, diagnosticEntrySchema } from "./common.js";
import { submissionSchema } from "./submission.js";
import { voteSchema } from "./vote.js";
import { resolutionSchema } from "./resolution.js";
import { ledgerEntrySchema } from "./ledger.js";

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
});
export type StorageState = z.infer<typeof storageStateSchema>;
