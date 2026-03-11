import { z } from "zod";

// ── Common / Bid / Assignment / Audit / Diagnostics ─────────────────

export const claimStatusSchema = z.enum([
  "ACTIVE",
  "COMPLETED",
  "EXPIRED",
  "CANCELLED",
]);
export type ClaimStatus = z.infer<typeof claimStatusSchema>;

export const bidSchema = z.object({
  agentId: z.string(),
  jobId: z.string(),
  stakeAmount: z.number(),
  stakeAt: z.string(),
  eligibilityProof: z.string().optional(),
  reputationSnapshot: z.number().optional(),
});
export type Bid = z.infer<typeof bidSchema>;

export const assignmentSchema = z.object({
  agentId: z.string(),
  jobId: z.string(),
  claimAt: z.string(),
  leaseUntil: z.string(),
  heartbeatAt: z.string(),
  status: claimStatusSchema,
});
export type Assignment = z.infer<typeof assignmentSchema>;

export const auditEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  type: z.string(),
  jobId: z.string().optional(),
  actorAgentId: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const diagnosticEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  message: z.string(),
  context: z.record(z.unknown()).optional(),
});
export type DiagnosticEntry = z.infer<typeof diagnosticEntrySchema>;
