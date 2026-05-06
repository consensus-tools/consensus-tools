---
"@consensus-tools/schemas": minor
---

Add Tier-0 audit-event payload schemas at `packages/schemas/src/audit-events.ts`.

- **`finalDecisionPayloadSchema`** — runtime-validated FINAL_DECISION audit payload. Single permissive `z.object` accepts canonical camelCase, legacy snake_case (pre-PR1 historical DB rows), and the chat-approval-limited shape. `.transform()` normalizes to canonical camelCase output (`{auditId, runId, boardId, decision, reason, riskScore, guardType, consensusMeta, approver, votesReceived, votesRequired, idempotencyKey}`). `.passthrough()` preserves unknown fields for forward-compat.
- **`participantMetadataSchema`** — stricter shape than the loose `z.record(z.unknown())` on `participantSchema.metadata`. Used by dashboard consumers that need typed `agentType`, `model`, etc. Rejects non-plain objects (Date, Map, Set, class instances) — closes the round-3 finding C parseMetadata slip-through. Returns a fresh object on each parse so caller mutations don't affect input — closes finding E.
- **`consensusMetaSchema`** — extracted shape for the consensus-meta sub-object emitted by `node-executor.ts` and historically present in DB rows.

Used by `apps/dashboard` via the new `parseTypedPayload` helper in `apps/dashboard/src/lib/safeJson.ts` (introduced in this PR) and consumed in PR3 by the dashboard render paths and a `DriftBanner` component that surfaces malformed payload counts.

**Sunset deadline (informational):** legacy snake_case + chat-approval-limited shapes are accepted until 2026-09-01. After sunset, the schema rejects non-canonical shapes for live events and consumers must update.

Part of the dashboard-zod-trust-boundary plan (PR2 of 3). PR1 (#35) canonicalized the audit-event producers; PR3 wires the dashboard through this schema.
