import { z } from "zod";

// ── Guard Types ─────────────────────────────────────────────────────

export const guardTypeSchema = z.enum([
  "send_email",
  "code_merge",
  "publish",
  "support_reply",
  "agent_action",
  "deployment",
  "permission_escalation",
  "seo_fix",
  "diff_check",
]);
export type GuardType = z.infer<typeof guardTypeSchema>;

export const guardDecisionSchema = z.enum(["ALLOW", "BLOCK", "REWRITE", "REQUIRE_HUMAN"]);
export type GuardDecision = z.infer<typeof guardDecisionSchema>;

export const guardVoteValueSchema = z.enum(["YES", "NO", "REWRITE"]);
export type GuardVoteValue = z.infer<typeof guardVoteValueSchema>;

// ── Guard Vote ──────────────────────────────────────────────────────

export const guardVoteSchema = z.object({
  evaluator: z.string(),
  vote: guardVoteValueSchema,
  reason: z.string(),
  risk: z.number().min(0).max(1),
});
export type GuardVote = z.infer<typeof guardVoteSchema>;

export const weightedGuardVoteSchema = guardVoteSchema.extend({
  weight: z.number(),
  confidence: z.number(),
  reputation: z.number().optional(),
});
export type WeightedGuardVote = z.infer<typeof weightedGuardVoteSchema>;

// ── Guard Policy ────────────────────────────────────────────────────

export const guardPolicySchema = z.object({
  policyId: z.string().default("default"),
  version: z.string().default("v1"),
  quorum: z.number().min(0).max(1).default(0.7),
  riskThreshold: z.number().min(0).max(1).default(0.7),
  hitlRequiredAboveRisk: z.number().min(0).max(1).default(0.7),
  options: z.record(z.unknown()).default({}),
});
export type GuardPolicy = z.infer<typeof guardPolicySchema>;

// ── Guard Evaluate Input / Request ──────────────────────────────────

export const guardEvaluateInputSchema = z.object({
  boardId: z.string().min(1),
  runId: z.string().optional(),
  agentId: z.string().optional(),
  action: z.object({
    type: z.string().min(1),
    payload: z.record(z.unknown()),
  }),
  policyPack: z.string().optional(),
});
export type GuardEvaluateInput = z.infer<typeof guardEvaluateInputSchema>;

export const guardEvaluateRequestSchema = z.object({
  runId: z.string(),
  boardId: z.string(),
  agentId: z.string().optional(),
  guardType: guardTypeSchema,
  payload: z.record(z.unknown()),
  policy: guardPolicySchema.default({}),
  idempotencyKey: z.string(),
});
export type GuardEvaluateRequest = z.infer<typeof guardEvaluateRequestSchema>;

// ── Guard Result ────────────────────────────────────────────────────

export const guardResultSchema = z.object({
  decision: guardDecisionSchema,
  reason: z.string(),
  risk_score: z.number().min(0).max(1),
  audit_id: z.string(),
  suggested_rewrite: z.unknown().optional(),
  next_step: z.object({ tool: z.string(), input: z.unknown() }).optional(),
  weighted_yes: z.number().min(0).max(1).optional(),
  votes: z.array(guardVoteSchema).optional(),
  guard_type: guardTypeSchema.optional(),
});
export type GuardResult = z.infer<typeof guardResultSchema>;

// ── Vote Tally ──────────────────────────────────────────────────────

export const weightingModeSchema = z.enum(["static", "reputation", "hybrid"]);
export type WeightingMode = z.infer<typeof weightingModeSchema>;

export interface VoteTally {
  yes: number;
  no: number;
  rewrite: number;
  totalWeight: number;
  weightedYes: number;
  weightedNo: number;
  weightedRewrite: number;
  voterCount: number;
}

// ── Human Approval Request ──────────────────────────────────────────

export const humanApprovalRequestSchema = z.object({
  runId: z.string(),
  approver: z.string().default("human"),
  replyText: z.string(),
  idempotencyKey: z.string(),
  boardId: z.string().optional(),
});
export type HumanApprovalRequest = z.infer<typeof humanApprovalRequestSchema>;

export function parseHumanApprovalYesNo(text: string): "YES" | "NO" | "REWRITE" {
  const t = text.trim().toLowerCase();
  if (["yes", "y", "approve", "ack", "acknowledge"].includes(t)) return "YES";
  if (["no", "n", "block", "deny", "reject"].includes(t)) return "NO";
  if (["rewrite", "revise", "revision"].includes(t)) return "REWRITE";
  throw new Error("Unrecognized Human Approval reply; expected YES, NO, or REWRITE");
}
