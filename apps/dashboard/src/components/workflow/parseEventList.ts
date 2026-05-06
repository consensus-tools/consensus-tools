/**
 * parseEventList — pure helper used by EventTimeline to memoize per-event
 * payload parsing. Extracted for testability (no React dep).
 */

import { z } from "zod";
import { finalDecisionPayloadSchema } from "@consensus-tools/schemas";
import { parseTypedPayload, type TypedParseResult } from "../../lib/safeJson";

// Permissive pass-through schema for event types without a dedicated schema.
const permissiveSchema = z.object({}).passthrough();

/** Choose the right Zod schema for a given event type. */
export function schemaForType(type: string): z.ZodTypeAny {
  if (type === "FINAL_DECISION") return finalDecisionPayloadSchema;
  return permissiveSchema;
}

export interface RawEvent {
  id: string;
  seq?: number;
  run_id?: string | null;
  ts: number;
  type: string;
  payload_json: string | null | undefined;
}

export interface ParsedEvent<T = unknown> extends RawEvent {
  parsed: TypedParseResult<T>;
}

/**
 * Maps a raw events array to a parsed-events array by running each event's
 * `payload_json` through the appropriate schema. The result is suitable for
 * memoization via React's `useMemo([events])`.
 */
export function parseEventList(events: RawEvent[]): ParsedEvent[] {
  return events.map((e) => ({
    ...e,
    parsed: parseTypedPayload(e.payload_json, schemaForType(e.type), "EventTimeline.payload"),
  }));
}

/**
 * Counts events whose payload failed to parse or validate (schema drift indicator).
 */
export function countDrift(parsedEvents: ParsedEvent[]): number {
  return parsedEvents.filter((e) => e.parsed.status === "invalid").length;
}
