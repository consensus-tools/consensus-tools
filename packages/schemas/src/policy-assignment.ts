import { z } from "zod";
import { weightingModeSchema } from "./guard.js";

// ── Policy Assignment ──────────────────────────────────────────────

export const policyAssignmentSchema = z.object({
  boardId: z.string(),
  policyId: z.string(),
  participants: z.array(z.string()),
  weightingMode: weightingModeSchema.default("hybrid"),
  quorum: z.number().min(0).max(1),
});
export type PolicyAssignment = z.infer<typeof policyAssignmentSchema>;

// ── Consensus Vote (guard/workflow) ────────────────────────────────

export const consensusVoteSchema = z.object({
  id: z.string(),
  boardId: z.string(),
  runId: z.string(),
  participantId: z.string(),
  decision: z.enum(["YES", "NO", "REWRITE"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string(),
  idempotencyKey: z.string(),
  createdAt: z.string(),
});
export type ConsensusVote = z.infer<typeof consensusVoteSchema>;
