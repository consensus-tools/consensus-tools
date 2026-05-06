/**
 * parseRunDecision — parse and classify a FINAL_DECISION event payload.
 *
 * Extracted from RunDetailPage for testability. Wraps parseTypedPayload with
 * the finalDecisionPayloadSchema so tests can exercise the classification
 * logic without rendering React components.
 */

import { finalDecisionPayloadSchema } from "@consensus-tools/schemas";
import type { FinalDecisionPayload } from "@consensus-tools/schemas";
import { parseTypedPayload } from "../lib/safeJson";
import type { TypedParseResult } from "../lib/safeJson";

export type { FinalDecisionPayload };

export type RunDecisionResult = TypedParseResult<FinalDecisionPayload>;

/**
 * Parse and schema-validate a FINAL_DECISION payload_json string.
 *
 * Returns a discriminated union:
 *   - { status: 'empty' }   — null/empty input (decision still pending)
 *   - { status: 'invalid' } — malformed JSON or schema violation (finding D)
 *   - { status: 'ok', value } — canonical FinalDecisionPayload
 */
export function parseRunDecision(
  payloadJson: string | null | undefined,
): RunDecisionResult {
  return parseTypedPayload(
    payloadJson,
    finalDecisionPayloadSchema,
    "RunDetailPage.finalDecision",
  );
}
