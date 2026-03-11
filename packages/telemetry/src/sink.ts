import type { TelemetryEvent, TraceSpan } from "@consensus-tools/schemas";

/** Interface for telemetry sinks that consume events and spans. */
export interface Sink {
  name: string;
  write(event: TelemetryEvent): void | Promise<void>;
  writeSpan?(span: TraceSpan): void | Promise<void>;
  flush?(): void | Promise<void>;
  close?(): void | Promise<void>;
}
