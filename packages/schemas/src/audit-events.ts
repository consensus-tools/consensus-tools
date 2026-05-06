import { z } from "zod";

// Tier-0 schemas for audit-event payloads at the producer/consumer trust boundary.
// Three FINAL_DECISION emit sites send slightly different shapes:
//   - core/guard-engine.ts:111 → canonical camelCase ({auditId, decision, reason, riskScore, guardType})
//   - workflows/node-executor.ts:596 → camelCase + {runId, boardId, consensusMeta} (camelCased in PR1, was snake_case)
//   - sdk-node/chat-approval.ts:61 → no risk fields ({runId, decision, approver, votesReceived, votesRequired, idempotencyKey?})
// Plus historical DB rows that may still use legacy snake_case (pre-PR1).
//
// The schema is a single permissive z.object that accepts canonical AND legacy
// keys, then `.transform()` normalizes to canonical camelCase. Consumers always
// see one shape regardless of producer or DB vintage.
//
// Sunset target: legacy snake_case + chat-approval-limited shapes are kept until
// 2026-09-01. After sunset, this schema rejects non-canonical shapes for live events.

// ── consensusMeta ───────────────────────────────────────────────────

export const consensusMetaSchema = z.object({
  quorumMet: z.boolean(),
  weightedYesRatio: z.number(),
  voterCount: z.number().int().nonnegative(),
}).passthrough();
export type ConsensusMeta = z.infer<typeof consensusMetaSchema>;

// ── FINAL_DECISION payload ──────────────────────────────────────────

const finalDecisionRawSchema = z.object({
  // Identity (some emitters include, some don't)
  auditId: z.string().optional(),
  audit_id: z.string().optional(), // legacy
  runId: z.string().optional(),
  boardId: z.string().optional(),

  // Required core
  decision: z.string(),

  // Optional reason (every emitter includes it but human-approval flow doesn't always)
  reason: z.string().optional(),

  // Risk fields: canonical OR legacy snake OR absent (chat-approval has none by design)
  riskScore: z.number().optional(),
  risk_score: z.number().optional(),

  guardType: z.string().optional(),
  guard_type: z.string().optional(),

  // Consensus meta: canonical OR legacy
  consensusMeta: consensusMetaSchema.optional(),
  consensus_meta: consensusMetaSchema.optional(),

  // Human-approval limited shape (chat-approval.ts)
  approver: z.string().optional(),
  votesReceived: z.number().int().nonnegative().optional(),
  votesRequired: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().optional(),
}).passthrough();

export const finalDecisionPayloadSchema = finalDecisionRawSchema.transform((raw) => {
  // Strip legacy snake_case keys after promoting to canonical, but preserve any
  // unknown passthrough fields the server may emit (forward-compat).
  const {
    audit_id: _legacyAuditId,
    risk_score: _legacyRiskScore,
    guard_type: _legacyGuardType,
    consensus_meta: _legacyConsensusMeta,
    ...rest
  } = raw;

  return {
    ...rest,
    auditId: raw.auditId ?? raw.audit_id,
    riskScore: raw.riskScore ?? raw.risk_score,
    guardType: raw.guardType ?? raw.guard_type,
    consensusMeta: raw.consensusMeta ?? raw.consensus_meta,
  };
});
export type FinalDecisionPayload = z.output<typeof finalDecisionPayloadSchema>;

// ── Participant metadata ────────────────────────────────────────────
//
// `participantSchema.metadata` at Tier 0 stays `z.record(z.unknown())` for
// backwards compat (other consumers). The dashboard needs a stricter shape;
// this schema is the dashboard's contract. Keeping it in audit-events.ts
// (Tier 0) lets future consumers reuse it without reinventing shape checks.

export const participantMetadataSchema = z.object({
  agentType: z.string().optional(),
  email: z.string().optional(),
  url: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  apiKey: z.string().optional(), // typically encrypted ref, not raw
  systemPrompt: z.string().optional(),
}).passthrough();
export type ParticipantMetadata = z.infer<typeof participantMetadataSchema>;
