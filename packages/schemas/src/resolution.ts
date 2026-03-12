import { z } from "zod";

// ── Resolution ──────────────────────────────────────────────────────

export const resolutionSchema = z.object({
  jobId: z.string(),
  runId: z.string().optional(),
  boardId: z.string().optional(),
  resolvedAt: z.string(),
  winners: z.array(z.string()),
  winningSubmissionIds: z.array(z.string()),
  payouts: z.array(
    z.object({ agentId: z.string(), amount: z.number() })
  ),
  slashes: z.array(
    z.object({
      agentId: z.string(),
      amount: z.number(),
      reason: z.string(),
    })
  ),
  consensusTrace: z.record(z.unknown()),
  finalArtifact: z.record(z.unknown()).nullable(),
  auditLog: z.array(z.string()),
});
export type Resolution = z.infer<typeof resolutionSchema>;
