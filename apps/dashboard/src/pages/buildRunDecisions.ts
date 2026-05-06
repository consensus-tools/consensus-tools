/**
 * buildRunDecisions — pure function that builds the run-ID → final-decision map
 * from a list of raw audit events.
 *
 * Extracted from BoardDetailPage so the map-build logic is unit-testable without
 * rendering the full page component.
 *
 * Behaviour (matches Wave-2 trust-boundary plan, findings B and F):
 *   - "empty" results (null / "" / whitespace payload_json) → skip: do not write
 *     a map entry. Legitimate "decision pending" state.
 *   - "invalid" results (JSON parse failure OR Zod schema rejection) → increment
 *     driftCount; do NOT overwrite a previously-valid map entry for the same run.
 *   - "ok" results → write to map (first-valid-event-wins order preserved by caller
 *     iterating events chronologically; later ok events will overwrite earlier ones).
 */

import { parseTypedPayload } from "../lib/safeJson";
import { finalDecisionPayloadSchema, type FinalDecisionPayload } from "@consensus-tools/schemas";

export interface RunDecisionEvent {
  type: string;
  run_id?: string | null;
  payload_json?: string | null;
}

export interface BuildRunDecisionsResult {
  map: Record<string, FinalDecisionPayload>;
  driftCount: number;
}

export function buildRunDecisions(
  events: RunDecisionEvent[],
  runId?: string,
): BuildRunDecisionsResult {
  const map: Record<string, FinalDecisionPayload> = {};
  let driftCount = 0;

  for (const e of events) {
    if (e.type !== "FINAL_DECISION") continue;

    const targetRunId = e.run_id ?? runId;
    if (!targetRunId) continue;

    const result = parseTypedPayload(
      e.payload_json,
      finalDecisionPayloadSchema,
      "BoardDetailPage.runDecisions",
    );

    if (result.status === "ok") {
      map[targetRunId] = result.value;
    } else if (result.status === "invalid") {
      // Do NOT overwrite a prior valid map entry — increment drift counter only
      driftCount++;
    }
    // status === "empty": legitimate pending state — do nothing
  }

  return { map, driftCount };
}
