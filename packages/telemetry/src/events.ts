import type { TelemetryEvent } from "@consensus-tools/schemas";

let idCounter = 0;
function eventId(): string {
  return `evt_${Date.now()}_${++idCounter}`;
}

/** Helper to construct a typed telemetry event. */
export function createEvent(
  type: TelemetryEvent["type"],
  jobId?: string,
  metadata?: Record<string, unknown>,
): TelemetryEvent {
  return {
    id: eventId(),
    type,
    timestamp: new Date().toISOString(),
    jobId,
    metadata,
  };
}
