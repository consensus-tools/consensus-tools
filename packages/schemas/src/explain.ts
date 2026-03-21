import { z } from "zod";

// ── Normalized Vote ────────────────────────────────────────────────
// Common shape that both GuardVote and ReviewResult normalize into.

export const normalizedVoteSchema = z.object({
  evaluator: z.string(),
  score: z.number().min(0).max(1),
  rationale: z.string(),
  vote: z.enum(["YES", "NO", "REWRITE"]).optional(),
  weight: z.number().optional(),
  reputation: z.number().optional(),
});
export type NormalizedVote = z.infer<typeof normalizedVoteSchema>;

// ── Explain Input ──────────────────────────────────────────────────
// Accepts either guard or wrapper decision data.

export const explainInputSchema = z.object({
  /** The audit_id linking to stored audit events. Optional if votes are provided inline. */
  auditId: z.string().optional(),
  /** Final decision (guard path). */
  decision: z.enum(["ALLOW", "BLOCK", "REWRITE", "REQUIRE_HUMAN", "allow", "block", "retry", "escalate"]).optional(),
  /** Overall risk score (0-1). */
  riskScore: z.number().min(0).max(1).optional(),
  /** Normalized votes — caller can provide pre-normalized or let explainDecision() normalize. */
  votes: z.array(normalizedVoteSchema).optional(),
  /** Policy context for explaining thresholds. */
  policy: z.object({
    quorum: z.number().optional(),
    riskThreshold: z.number().optional(),
    strategy: z.string().optional(),
    threshold: z.number().optional(),
  }).optional(),
  /** Human-readable label for what was being decided. */
  actionLabel: z.string().optional(),
  /** The guard type (e.g., "send_email", "code_merge"). */
  guardType: z.string().optional(),
});
export type ExplainInput = z.infer<typeof explainInputSchema>;

// ── Explain Result ─────────────────────────────────────────────────

export const explainResultSchema = z.object({
  status: z.enum(["ok", "error"]),
  /** Human-readable narrative explanation. Present when status is "ok". */
  narrative: z.string().optional(),
  /** Error message. Present when status is "error". */
  error: z.string().optional(),
  /** The audit ID this explanation refers to. */
  auditId: z.string().optional(),
});
export type ExplainResult = z.infer<typeof explainResultSchema>;
