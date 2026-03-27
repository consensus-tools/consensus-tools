import { z } from "zod";

// ── Telemetry Events ────────────────────────────────────────────────
// "Core decides, telemetry observes."

export const telemetryEventTypeSchema = z.enum([
  "job.created",
  "job.claimed",
  "job.submitted",
  "job.voted",
  "job.resolved",
  "job.expired",
  "ledger.faucet",
  "ledger.stake",
  "ledger.payout",
  "ledger.slash",
  "wrapper.invoked",
  "wrapper.decided",
  "wrapper.blocked",
  "wrapper.escalated",
  "guard.evaluated",
  "reputation.updated",
  "persona.respawned",
]);
export type TelemetryEventType = z.infer<typeof telemetryEventTypeSchema>;

export const telemetryEventSchema = z.object({
  id: z.string(),
  type: telemetryEventTypeSchema,
  timestamp: z.string(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  parentSpanId: z.string().optional(),
  jobId: z.string().optional(),
  agentId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  duration: z.number().optional(),
});
export type TelemetryEvent = z.infer<typeof telemetryEventSchema>;

export const traceSpanSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  status: z.enum(["ok", "error", "pending"]).optional(),
  attributes: z.record(z.unknown()).optional(),
  events: z.array(telemetryEventSchema).optional(),
});
export type TraceSpan = z.infer<typeof traceSpanSchema>;
