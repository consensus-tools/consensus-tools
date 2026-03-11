import { z } from "zod";

// ── Vote ────────────────────────────────────────────────────────────

export const voteTargetTypeSchema = z.enum(["SUBMISSION", "CHOICE"]);
export type VoteTargetType = z.infer<typeof voteTargetTypeSchema>;

export const voteSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  boardId: z.string().optional(),
  voterPrincipalId: z.string().optional(),
  submissionId: z.string().optional(),
  targetType: voteTargetTypeSchema.optional(),
  targetId: z.string().optional(),
  choiceKey: z.string().optional(),
  agentId: z.string(),
  score: z.number(),
  weight: z.number().optional(),
  stakeAmount: z.number().optional(),
  rationale: z.string().optional(),
  createdAt: z.string(),
});
export type Vote = z.infer<typeof voteSchema>;
