import { describe, it, expect } from "vitest";
import {
  finalDecisionPayloadSchema,
  participantMetadataSchema,
} from "../src/audit-events.js";

// Representative payload shapes from the three FINAL_DECISION emit sites.
// These match the actual emit code as of post-PR1; legacy entries cover
// historical DB rows that were written before PR1 canonicalized the producers.

const HISTORICAL_PAYLOADS = {
  // Pre-PR1: workflows/node-executor.ts emitted snake_case
  legacyWorkflowsSnake: {
    runId: "run-1",
    boardId: "board-1",
    decision: "ALLOW",
    reason: "code_merge consensus: 2/2 YES votes",
    risk_score: 0.32,
    guard_type: "code_merge",
    consensus_meta: {
      quorumMet: true,
      weightedYesRatio: 1.0,
      voterCount: 2,
    },
  },
  // Post-PR1: workflows/node-executor.ts canonical camelCase
  canonicalWorkflows: {
    runId: "run-2",
    boardId: "board-1",
    decision: "BLOCK",
    reason: "code_merge consensus: 0/2 YES votes",
    riskScore: 0.85,
    guardType: "code_merge",
    consensusMeta: {
      quorumMet: false,
      weightedYesRatio: 0.0,
      voterCount: 2,
    },
  },
  // Always canonical: core/guard-engine.ts (with auditId, no runId/boardId)
  canonicalGuardEngine: {
    auditId: "audit-3",
    decision: "ALLOW",
    reason: "evaluator consensus passed",
    riskScore: 0.12,
    guardType: "agent_action",
  },
  // Limited by design: sdk-node/chat-approval.ts (no risk fields)
  chatApprovalLimited: {
    runId: "run-4",
    decision: "YES",
    approver: "operator",
    votesReceived: 1,
    votesRequired: 1,
  },
  chatApprovalWithIdempotency: {
    runId: "run-5",
    decision: "NO",
    approver: "operator",
    votesReceived: 2,
    votesRequired: 2,
    idempotencyKey: "idem-abc",
  },
} as const;

describe("finalDecisionPayloadSchema", () => {
  it("accepts canonical workflows emit (post-PR1) and returns identity for camelCase fields", () => {
    const result = finalDecisionPayloadSchema.safeParse(HISTORICAL_PAYLOADS.canonicalWorkflows);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      runId: "run-2",
      boardId: "board-1",
      decision: "BLOCK",
      riskScore: 0.85,
      guardType: "code_merge",
      consensusMeta: { quorumMet: false, weightedYesRatio: 0.0, voterCount: 2 },
    });
  });

  it("accepts canonical guard-engine emit (with auditId, no runId/boardId)", () => {
    const result = finalDecisionPayloadSchema.safeParse(HISTORICAL_PAYLOADS.canonicalGuardEngine);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.auditId).toBe("audit-3");
    expect(result.data.riskScore).toBe(0.12);
  });

  it("accepts chat-approval limited shape (no risk fields)", () => {
    const result = finalDecisionPayloadSchema.safeParse(HISTORICAL_PAYLOADS.chatApprovalLimited);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      runId: "run-4",
      decision: "YES",
      approver: "operator",
      votesReceived: 1,
      votesRequired: 1,
    });
    expect(result.data.riskScore).toBeUndefined();
    expect(result.data.guardType).toBeUndefined();
  });

  it("propagates idempotencyKey through transform", () => {
    const result = finalDecisionPayloadSchema.safeParse(HISTORICAL_PAYLOADS.chatApprovalWithIdempotency);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.idempotencyKey).toBe("idem-abc");
  });

  it("normalizes legacy snake_case to canonical camelCase (DB-replay scenario)", () => {
    const result = finalDecisionPayloadSchema.safeParse(HISTORICAL_PAYLOADS.legacyWorkflowsSnake);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Output is canonical camelCase regardless of input casing
    expect(result.data.riskScore).toBe(0.32);
    expect(result.data.guardType).toBe("code_merge");
    expect(result.data.consensusMeta).toEqual({
      quorumMet: true,
      weightedYesRatio: 1.0,
      voterCount: 2,
    });
  });

  it("prefers camelCase when both casings are present (canonical wins on drift)", () => {
    const driftPayload = {
      decision: "ALLOW",
      riskScore: 0.5, // canonical
      risk_score: 0.9, // legacy — must be ignored
      guardType: "code_merge", // canonical
      guard_type: "send_email", // legacy — must be ignored
    };
    const result = finalDecisionPayloadSchema.safeParse(driftPayload);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.riskScore).toBe(0.5);
    expect(result.data.guardType).toBe("code_merge");
  });

  it("rejects payload without decision", () => {
    const result = finalDecisionPayloadSchema.safeParse({ riskScore: 0.5 });
    expect(result.success).toBe(false);
  });

  it("rejects payload with wrong type for riskScore", () => {
    const result = finalDecisionPayloadSchema.safeParse({
      decision: "ALLOW",
      riskScore: "not a number",
    });
    expect(result.success).toBe(false);
  });

  it("rejects primitives, arrays, dates", () => {
    expect(finalDecisionPayloadSchema.safeParse(null).success).toBe(false);
    expect(finalDecisionPayloadSchema.safeParse("string").success).toBe(false);
    expect(finalDecisionPayloadSchema.safeParse(42).success).toBe(false);
    expect(finalDecisionPayloadSchema.safeParse([]).success).toBe(false);
    expect(finalDecisionPayloadSchema.safeParse(new Date()).success).toBe(false);
  });

  it("preserves unknown fields via passthrough (forward-compat)", () => {
    const futureShape = {
      decision: "ALLOW",
      reason: "ok",
      riskScore: 0.1,
      guardType: "agent_action",
      newField: "future server emit",
      anotherFutureField: { nested: true },
    };
    const result = finalDecisionPayloadSchema.safeParse(futureShape);
    expect(result.success).toBe(true);
    // passthrough: caller can read unknown fields if they want
    if (!result.success) return;
    expect((result.data as Record<string, unknown>).newField).toBe("future server emit");
  });
});

describe("participantMetadataSchema", () => {
  it("accepts known agent metadata shape", () => {
    const meta = { agentType: "internal", model: "claude-sonnet-4-6" };
    const result = participantMetadataSchema.safeParse(meta);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.agentType).toBe("internal");
    expect(result.data.model).toBe("claude-sonnet-4-6");
  });

  it("accepts empty object (legitimate 'no metadata' state)", () => {
    const result = participantMetadataSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects non-object inputs (closes round-3 finding C: Date/Map/Set slip-through)", () => {
    expect(participantMetadataSchema.safeParse(null).success).toBe(false);
    expect(participantMetadataSchema.safeParse("string").success).toBe(false);
    expect(participantMetadataSchema.safeParse(42).success).toBe(false);
    expect(participantMetadataSchema.safeParse([]).success).toBe(false);
    expect(participantMetadataSchema.safeParse(new Date()).success).toBe(false);
    expect(participantMetadataSchema.safeParse(new Map()).success).toBe(false);
    expect(participantMetadataSchema.safeParse(new Set()).success).toBe(false);
  });

  it("returns a fresh object — caller mutations don't affect input (closes finding E)", () => {
    const input = { agentType: "internal" };
    const result = participantMetadataSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Zod's .parse() returns a new object — mutating output does not mutate input
    (result.data as Record<string, unknown>).agentType = "MUTATED";
    expect(input.agentType).toBe("internal");
  });

  it("preserves unknown fields via passthrough", () => {
    const meta = {
      agentType: "internal",
      customField: "from server",
    };
    const result = participantMetadataSchema.safeParse(meta);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect((result.data as Record<string, unknown>).customField).toBe("from server");
  });
});
