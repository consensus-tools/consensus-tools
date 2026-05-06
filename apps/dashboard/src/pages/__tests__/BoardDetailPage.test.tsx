/**
 * Regression tests for BoardDetailPage findings B and F
 * (wave-2 dashboard-zod-trust-boundary plan).
 *
 * These tests target the pure `buildRunDecisions` helper that was extracted
 * from BoardDetailPage for testability.  No React rendering required.
 *
 * Finding B: isEmpty check misclassified null/false/0 as empty, allowing a
 *   subsequent null/invalid event to silently overwrite a prior valid map entry.
 *
 * Finding F: The old code used raw JSON parsing (any-cast), so downstream reads
 *   like `decision.guard_type` / `decision.risk_score` (snake_case) would break
 *   for canonical camelCase events emitted by the current producer.  The new code
 *   uses parseTypedPayload + finalDecisionPayloadSchema which normalises to
 *   canonical camelCase regardless of producer vintage.
 */

import { describe, it, expect } from "vitest";
import { buildRunDecisions, type RunDecisionEvent } from "../buildRunDecisions";
import { parseTypedPayload } from "../../lib/safeJson";
import { finalDecisionPayloadSchema } from "@consensus-tools/schemas";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeEvent(
  run_id: string,
  payload_json: string | null | undefined,
): RunDecisionEvent {
  return { type: "FINAL_DECISION", run_id, payload_json };
}

const VALID_PAYLOAD_JSON =
  '{"decision":"ALLOW","riskScore":0.2,"guardType":"code_merge"}';

// ── Regression B: null literal must NOT overwrite a prior valid entry ─────────

describe("buildRunDecisions — finding B regression", () => {
  it("Test 1: null literal payload does not overwrite a prior valid entry", () => {
    const events: RunDecisionEvent[] = [
      makeEvent("run-1", VALID_PAYLOAD_JSON),
      makeEvent("run-1", "null"), // 'null' is valid JSON but fails object schema
    ];

    const { map, driftCount } = buildRunDecisions(events);

    // The valid entry must survive
    expect(map["run-1"]).toBeDefined();
    expect(map["run-1"].decision).toBe("ALLOW");
    expect(map["run-1"].riskScore).toBe(0.2);
    expect(map["run-1"].guardType).toBe("code_merge");

    // The null literal is an invalid shape → driftCount incremented
    expect(driftCount).toBe(1);
  });

  it("Test 2: empty-string payload does not write a map entry; first valid one wins", () => {
    const events: RunDecisionEvent[] = [
      makeEvent("run-2", ""),            // empty → skip (no entry written)
      makeEvent("run-2", VALID_PAYLOAD_JSON), // valid → written
    ];

    const { map, driftCount } = buildRunDecisions(events);

    expect(map["run-2"]).toBeDefined();
    expect(map["run-2"].decision).toBe("ALLOW");
    // empty events are not invalid — driftCount stays 0
    expect(driftCount).toBe(0);
  });

  it("Test 3: type-mismatch payload does not overwrite a prior valid entry", () => {
    // riskScore is "abc" — valid JSON but fails z.number() → schema rejected
    const invalidPayload = '{"decision":"ALLOW","riskScore":"abc"}';

    const events: RunDecisionEvent[] = [
      makeEvent("run-3", VALID_PAYLOAD_JSON),
      makeEvent("run-3", invalidPayload),
    ];

    const { map, driftCount } = buildRunDecisions(events);

    expect(map["run-3"]).toBeDefined();
    expect(map["run-3"].decision).toBe("ALLOW");
    expect(map["run-3"].riskScore).toBe(0.2);

    // The invalid event increments driftCount
    expect(driftCount).toBe(1);
  });
});

// ── Regression F: canonical camelCase normalisation ───────────────────────────

describe("buildRunDecisions — finding F regression", () => {
  it("Test 4: canonical camelCase event produces map entry matching direct parseTypedPayload call", () => {
    const events: RunDecisionEvent[] = [
      makeEvent("run-4", VALID_PAYLOAD_JSON),
    ];

    const { map } = buildRunDecisions(events);

    // Independently parse with the same helper to get the expected canonical value
    const directResult = parseTypedPayload(
      VALID_PAYLOAD_JSON,
      finalDecisionPayloadSchema,
    );
    expect(directResult.status).toBe("ok");
    if (directResult.status !== "ok") throw new Error("guard: unexpected status");

    expect(map["run-4"]).toEqual(directResult.value);
  });

  it("Test 4b: legacy snake_case event is normalised to camelCase (same canonical shape)", () => {
    // Simulate a DB row produced before PR1 (snake_case producer)
    const legacyPayload =
      '{"decision":"BLOCK","risk_score":0.9,"guard_type":"deployment"}';

    const events: RunDecisionEvent[] = [
      makeEvent("run-5", legacyPayload),
    ];

    const { map, driftCount } = buildRunDecisions(events);

    expect(map["run-5"]).toBeDefined();
    expect(map["run-5"].decision).toBe("BLOCK");
    // transform() promotes snake_case → camelCase
    expect(map["run-5"].riskScore).toBe(0.9);
    expect(map["run-5"].guardType).toBe("deployment");
    // The legacy keys are stripped by the transform
    expect((map["run-5"] as any).risk_score).toBeUndefined();
    expect((map["run-5"] as any).guard_type).toBeUndefined();

    expect(driftCount).toBe(0);
  });
});

// ── driftCount accumulation ───────────────────────────────────────────────────

describe("buildRunDecisions — driftCount", () => {
  it("Test 5: driftCount increments once per invalid event", () => {
    const events: RunDecisionEvent[] = [
      makeEvent("run-a", VALID_PAYLOAD_JSON),       // ok
      makeEvent("run-b", "null"),                   // invalid: null is not an object
      makeEvent("run-c", "{bad json}"),             // invalid: JSON parse failure
      makeEvent("run-d", '{"decision":123}'),       // invalid: decision must be string
      makeEvent("run-e", ""),                        // empty (not invalid) → no bump
      makeEvent("run-f", null),                     // empty (null) → no bump
      makeEvent("run-g", VALID_PAYLOAD_JSON),       // ok
    ];

    const { map, driftCount } = buildRunDecisions(events);

    // Three invalid events
    expect(driftCount).toBe(3);

    // Two valid events
    expect(Object.keys(map)).toHaveLength(2);
    expect(map["run-a"]).toBeDefined();
    expect(map["run-g"]).toBeDefined();
  });
});
