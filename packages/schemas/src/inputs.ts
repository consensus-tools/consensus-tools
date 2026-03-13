import { z } from "zod";
import { jobModeSchema, jobConstraintsSchema } from "./job.js";
import { consensusPolicyConfigSchema, slashingPolicySchema } from "./policy.js";

// ── Reusable field ─────────────────────────────────────────────────

export const agentIdFieldSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
});
export type AgentIdField = z.infer<typeof agentIdFieldSchema>;

// ── Job Post Input ─────────────────────────────────────────────────

export const jobPostInputSchema = z
  .object({
    title: z.string().min(1, "title is required"),
    description: z.string().optional(),
    inputRef: z.string().optional(),
    inputs: z.record(z.unknown()).optional(),
    mode: jobModeSchema.optional(),
    policyKey: z.string().optional(),
    policyConfigJson: z.record(z.unknown()).optional(),
    currency: z.string().optional(),
    opensAt: z.string().optional(),
    closesAt: z.string().optional(),
    resolvesAt: z.string().optional(),
    artifactSchemaJson: z.record(z.unknown()).optional(),
    boardId: z.string().optional(),
    reward: z.number().min(0).optional(),
    tags: z.array(z.string()).optional(),
    priority: z.number().optional(),
    requiredCapabilities: z.array(z.string()).optional(),
    constraints: jobConstraintsSchema.optional(),
    maxParticipants: z.number().int().min(1).optional(),
    minParticipants: z.number().int().min(1).optional(),
    consensusPolicy: consensusPolicyConfigSchema.optional(),
    slashingPolicy: slashingPolicySchema.optional(),
    expiresSeconds: z.number().min(1).optional(),
    stakeRequired: z.number().min(0).optional(),
  })
  .passthrough();
export type JobPostInput = z.infer<typeof jobPostInputSchema>;

// ── Claim Input ────────────────────────────────────────────────────

export const claimInputSchema = z.object({
  stakeAmount: z.number().min(0),
  leaseSeconds: z.number().min(1),
});
export type ClaimInput = z.infer<typeof claimInputSchema>;

// ── Submit Input ───────────────────────────────────────────────────

export const submitInputSchema = z.object({
  summary: z.string().default(""),
  artifacts: z.record(z.unknown()).default({}),
  artifactRef: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.5),
  requestedPayout: z.number().min(0).optional(),
});
export type SubmitInput = z.infer<typeof submitInputSchema>;

// ── Vote Input ─────────────────────────────────────────────────────

export const voteInputSchema = z.object({
  submissionId: z.string().optional(),
  targetType: z.enum(["SUBMISSION", "CHOICE"]).optional(),
  targetId: z.string().optional(),
  choiceKey: z.string().optional(),
  weight: z.number().min(0).optional(),
  stakeAmount: z.number().min(0).optional(),
  score: z.number().optional(),
  rationale: z.string().optional(),
});
export type VoteInput = z.infer<typeof voteInputSchema>;

// ── Resolve Input ──────────────────────────────────────────────────

export const resolveInputSchema = z.object({
  manualWinners: z.array(z.string()).optional(),
  manualSubmissionId: z.string().optional(),
});
export type ResolveInput = z.infer<typeof resolveInputSchema>;

// ── Participant Create Input ──────────────────────────────────────

export const participantCreateInputSchema = z.object({
  boardId: z.string().min(1, "boardId is required"),
  subjectType: z.enum(["agent", "human"]).default("agent"),
  subjectId: z.string().min(1, "subjectId is required"),
  role: z.string().default("voter"),
  weight: z.number().min(0).default(1),
  reputation: z.number().min(0).default(50),
  metadata: z.record(z.unknown()).default({}),
});
export type ParticipantCreateInput = z.infer<typeof participantCreateInputSchema>;

// ── Consensus Vote Input ──────────────────────────────────────────

export const consensusVoteInputSchema = z.object({
  boardId: z.string().min(1, "boardId is required"),
  runId: z.string().min(1, "runId is required"),
  participantId: z.string().min(1, "participantId is required"),
  decision: z.enum(["YES", "NO", "REWRITE"]),
  confidence: z.number().min(0).max(1).default(1),
  rationale: z.string().default(""),
  idempotencyKey: z.string().optional(),
});
export type ConsensusVoteInput = z.infer<typeof consensusVoteInputSchema>;

// ── Workflow Create Input ──────────────────────────────────────────

export const workflowCreateInputSchema = z.object({
  name: z.string().min(1, "name is required"),
  definition: z.record(z.unknown()).default({}),
  templateId: z.string().optional(),
});
export type WorkflowCreateInput = z.infer<typeof workflowCreateInputSchema>;

// ── Cron Register Input ────────────────────────────────────────────

export const cronRegisterInputSchema = z.object({
  workflowId: z.string().min(1, "workflowId is required"),
  cronExpression: z.string().min(9, "cronExpression must be a valid 5-field cron expression"),
});
export type CronRegisterInput = z.infer<typeof cronRegisterInputSchema>;
