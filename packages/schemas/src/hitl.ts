import { z } from "zod";

// ── HITL Approval ───────────────────────────────────────────────────

export const hitlModeSchema = z.enum(["approval", "vote"]);
export type HitlMode = z.infer<typeof hitlModeSchema>;

export const hitlStatusSchema = z.enum(["pending", "resolved", "expired"]);
export type HitlStatus = z.infer<typeof hitlStatusSchema>;

export const hitlApprovalSchema = z.object({
  id: z.string(),
  runId: z.string(),
  boardId: z.string(),
  workflowId: z.string().optional(),
  timeoutSec: z.number(),
  requiredVotes: z.number().default(1),
  receivedVotes: z.number().default(0),
  mode: hitlModeSchema,
  autoDecisionOnExpiry: z.string().default("BLOCK"),
  startedAt: z.string(),
  warningSentAt: z.string().nullable(),
  status: hitlStatusSchema,
});
export type HitlApproval = z.infer<typeof hitlApprovalSchema>;

export const humanDecisionSchema = z.object({
  decision: z.enum(["YES", "NO", "REWRITE"]),
  approver: z.string(),
  reason: z.string().optional(),
  idempotencyKey: z.string(),
  createdAt: z.string(),
});
export type HumanDecision = z.infer<typeof humanDecisionSchema>;
