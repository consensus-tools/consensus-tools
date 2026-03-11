import { z } from "zod";

// ── Submission ──────────────────────────────────────────────────────

export const submissionStatusSchema = z.enum([
  "VALID",
  "WITHDRAWN",
  "SELECTED",
  "REJECTED",
  "SUBMITTED",
  "ACCEPTED",
]);
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

export const submissionSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  boardId: z.string().optional(),
  submitterPrincipalId: z.string().optional(),
  agentId: z.string(),
  submittedAt: z.string(),
  createdAt: z.string().optional(),
  artifactRef: z.string().optional(),
  artifacts: z.record(z.unknown()),
  summary: z.string(),
  confidence: z.number(),
  requestedPayout: z.number(),
  evidenceLinks: z.array(z.string()).optional(),
  status: submissionStatusSchema,
});
export type Submission = z.infer<typeof submissionSchema>;
