import { participantMetadataSchema, type ParticipantMetadata } from "@consensus-tools/schemas";
import { parseTypedPayload } from "../../lib/safeJson";

/**
 * Safely parses participant metadata, always returning a fresh plain object.
 *
 * Three code paths, all returning a fresh object so callers (startEdit, saveEdit)
 * cannot accidentally mutate the source participant:
 *
 *  1. metadata_json string  → parseTypedPayload → participantMetadataSchema
 *  2. metadata object       → participantMetadataSchema.safeParse (zod copies on success)
 *  3. neither present       → {}
 *
 * Closes finding E (live-reference mutation safety) and finding C (rejects
 * non-plain-object instances such as Date, Map, Set, and class instances).
 */
export function parseAgentMetadata(p: {
  metadata?: unknown;
  metadata_json?: unknown;
}): ParticipantMetadata {
  // Path 1: prefer metadata_json string
  if (typeof p.metadata_json === "string" && p.metadata_json !== "") {
    const result = parseTypedPayload(
      p.metadata_json,
      participantMetadataSchema,
      "AgentsPanel.metadata",
    );
    if (result.status === "ok") return result.value;
    return {};
  }

  // Path 2: metadata already parsed as an object
  if (typeof p.metadata === "object" && p.metadata !== null) {
    // participantMetadataSchema.safeParse always returns a NEW object (zod copies),
    // so mutations of the returned value cannot reach the original p.metadata.
    const result = participantMetadataSchema.safeParse(p.metadata);
    if (result.success) return result.data;
    return {};
  }

  // Path 3: nothing useful present
  return {};
}
