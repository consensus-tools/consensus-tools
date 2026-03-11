import { z } from "zod";
import { consensusPolicyConfigSchema, slashingPolicySchema } from "./policy.js";

// ── Job ─────────────────────────────────────────────────────────────

export const jobModeSchema = z.enum(["SUBMISSION", "VOTING"]);
export type JobMode = z.infer<typeof jobModeSchema>;

export const jobStatusSchema = z.enum([
  "OPEN",
  "CLOSED",
  "RESOLVED",
  "CANCELLED",
  "CLAIMED",
  "IN_PROGRESS",
  "SUBMITTED",
  "EXPIRED",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobConstraintsSchema = z.object({
  timeSeconds: z.number().optional(),
  budget: z.number().optional(),
});
export type JobConstraints = z.infer<typeof jobConstraintsSchema>;

export const escrowPolicySchema = z.object({
  type: z.enum(["mint", "pool"]),
  poolAccountId: z.string().optional(),
});
export type EscrowPolicy = z.infer<typeof escrowPolicySchema>;

export const jobSchema = z.object({
  id: z.string(),
  boardId: z.string().optional(),
  creatorPrincipalId: z.string().optional(),
  title: z.string(),
  desc: z.string().optional(),
  description: z.string(),
  inputRef: z.string().optional(),
  createdAt: z.string(),
  expiresAt: z.string(),
  opensAt: z.string().optional(),
  closesAt: z.string().optional(),
  resolvesAt: z.string().optional(),
  createdByAgentId: z.string(),
  mode: jobModeSchema.optional(),
  policyKey: z.string().optional(),
  policyConfigJson: z.record(z.unknown()).optional(),
  tags: z.array(z.string()),
  priority: z.number(),
  requiredCapabilities: z.array(z.string()),
  inputs: z.record(z.unknown()),
  constraints: jobConstraintsSchema,
  reward: z.number(),
  rewardAmount: z.number().optional(),
  stakeRequired: z.number(),
  stakeAmount: z.number().optional(),
  currency: z.string().optional(),
  maxParticipants: z.number(),
  minParticipants: z.number(),
  consensusPolicy: consensusPolicyConfigSchema,
  slashingPolicy: slashingPolicySchema,
  escrowPolicy: escrowPolicySchema,
  artifactSchemaJson: z.record(z.unknown()).optional(),
  status: jobStatusSchema,
});
export type Job = z.infer<typeof jobSchema>;
