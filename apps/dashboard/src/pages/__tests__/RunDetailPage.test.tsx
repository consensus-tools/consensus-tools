/**
 * Regression tests for finding D: RunDetailPage FINAL_DECISION parse safety.
 *
 * Strategy: the parse-and-classify logic is extracted to `parseRunDecision`
 * (a pure function) so tests exercise the contract without requiring a full
 * React rendering environment. Each test targets a real scenario that previously
 * produced NaN% or silent undefined garbage.
 */

import { describe, it, expect } from "vitest";
import { parseRunDecision } from "../parseRunDecision";

// ── Finding D regression tests ────────────────────────────────────────────────

describe("parseRunDecision — finding D regression suite", () => {
  /**
   * Test 1 (regression D): chat-approval emit shape has no riskScore / guardType
   * (matches sdk-node/chat-approval.ts:61-62 emit signature).
   * The old code would render `risk: NaN%` because it did `parsed.risk_score * 100`.
   * After the fix, this shape parses as 'ok' with riskScore === undefined.
   */
  it("Test 1: chat-approval limited shape (no riskScore, no guardType) parses as ok with riskScore undefined", () => {
    const payload = JSON.stringify({
      runId: "run-abc123",
      decision: "ALLOW",
      approver: "human@example.com",
      votesReceived: 2,
      votesRequired: 2,
    });

    const result = parseRunDecision(payload);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return; // type narrowing guard

    // riskScore must be undefined, NOT a number that would produce NaN%
    expect(result.value.riskScore).toBeUndefined();
    // guardType absent means no badge should appear
    expect(result.value.guardType).toBeUndefined();
    // decision is present and correct
    expect(result.value.decision).toBe("ALLOW");
  });

  /**
   * Test 2 (regression D): A FINAL_DECISION with a malformed riskScore (string
   * instead of number) must return status='invalid', not coerce to NaN.
   * The old code would compute `"not-a-number" * 100 = NaN` and render "risk: NaN%".
   */
  it("Test 2: malformed riskScore (string) returns status=invalid, not NaN", () => {
    const payload = JSON.stringify({
      decision: "ALLOW",
      reason: "looks good",
      riskScore: "not-a-number", // intentionally wrong type
    });

    const result = parseRunDecision(payload);

    expect(result.status).toBe("invalid");
    // Must NOT be ok with a NaN riskScore
    if (result.status === "ok") {
      throw new Error("Expected invalid but got ok — riskScore string would render as NaN%");
    }
  });

  /**
   * Test 3: Empty payload_json ('' or null) must return status='empty'.
   * This is the "decision pending" state — the degraded card, not a crash.
   */
  it("Test 3: empty payload_json returns status=empty (decision pending)", () => {
    expect(parseRunDecision("")).toEqual({ status: "empty" });
    expect(parseRunDecision(null)).toEqual({ status: "empty" });
    expect(parseRunDecision(undefined)).toEqual({ status: "empty" });
    expect(parseRunDecision("   ")).toEqual({ status: "empty" });
  });

  /**
   * Test 4: Canonical FINAL_DECISION with riskScore:0.85 and guardType:"code_merge"
   * must parse as ok and surface 85% (not NaN%).
   * Verifies the happy-path render — the number is readable as-is for `(riskScore * 100).toFixed(0)`.
   */
  it("Test 4: canonical payload with riskScore:0.85 and guardType:code_merge surfaces 85%", () => {
    const payload = JSON.stringify({
      auditId: "aud-001",
      decision: "BLOCK",
      reason: "high risk",
      riskScore: 0.85,
      guardType: "code_merge",
    });

    const result = parseRunDecision(payload);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.value.riskScore).toBe(0.85);
    // Verify what the UI would render: should be "85", not "NaN"
    // Use a non-null assertion + type guard to satisfy TypeScript — we just
    // asserted the value above so we know it is present.
    const riskScore = result.value.riskScore;
    expect(riskScore).toBeDefined();
    if (riskScore === undefined) throw new Error("riskScore should be defined");
    const rendered = (riskScore * 100).toFixed(0);
    expect(rendered).toBe("85");
    expect(rendered).not.toBe("NaN");

    expect(result.value.guardType).toBe("code_merge");
    expect(result.value.decision).toBe("BLOCK");
  });

  /**
   * Test 5: An invalid (non-empty, malformed) FINAL_DECISION payload must return
   * status='invalid'. This is the signal used to increment the drift counter.
   * Both JSON-unparseable and schema-invalid inputs are covered.
   */
  it("Test 5: invalid (non-empty, malformed) payload returns status=invalid for drift counter", () => {
    // Completely unparseable JSON
    const badJsonResult = parseRunDecision("{this is not json");
    expect(badJsonResult.status).toBe("invalid");

    // Valid JSON but fails schema (missing required `decision` field)
    const missingDecisionResult = parseRunDecision(
      JSON.stringify({ reason: "no decision key here" }),
    );
    expect(missingDecisionResult.status).toBe("invalid");

    // Valid JSON, wrong type on decision field
    const wrongTypeResult = parseRunDecision(
      JSON.stringify({ decision: 42, reason: "number is not a string" }),
    );
    expect(wrongTypeResult.status).toBe("invalid");
  });
});
