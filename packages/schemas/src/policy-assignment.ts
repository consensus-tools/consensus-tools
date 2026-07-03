import { z } from "zod";
import { weightingModeSchema } from "./guard.js";

// ── Policy Assignment ──────────────────────────────────────────────

export const policyAssignmentSchema = z.object({
  boardId: z.string(),
  policyId: z.string(),
  participants: z.array(z.string()),
  weightingMode: weightingModeSchema.default("hybrid"),
  quorum: z.number().min(0).max(1),
  // Optional per-board risk thresholds, honored by callers that resolve the board's
  // assignment into an effective GuardPolicy (the MCP adapter's guard.* tools do
  // this; workflow guard NODES take thresholds from node.config and do not read
  // these). When set they override the policy defaults (0.7): `riskThreshold` gates
  // the weighted decision; `hitlRequiredAboveRisk` routes actions at or above this
  // risk to human review (REQUIRE_HUMAN). Both are optional so assignments
  // persisted before this field was added still validate.
  riskThreshold: z.number().min(0).max(1).optional(),
  hitlRequiredAboveRisk: z.number().min(0).max(1).optional(),
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
