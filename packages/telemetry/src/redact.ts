import type { TelemetryEvent } from "@consensus-tools/schemas";

/** Fields to always strip from events before export. */
const SENSITIVE_FIELDS = new Set(["apiKey", "secret", "token", "password", "credential"]);

/** Redact sensitive fields from an event's metadata. */
export function redact(event: TelemetryEvent): TelemetryEvent {
  if (!event.metadata) return event;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event.metadata)) {
    cleaned[key] = SENSITIVE_FIELDS.has(key) ? "[REDACTED]" : value;
  }
  return { ...event, metadata: cleaned };
}
