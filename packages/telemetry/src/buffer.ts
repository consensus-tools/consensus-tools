import type { TelemetryEvent, TraceSpan } from "@consensus-tools/schemas";
import type { Sink } from "./sink.js";

/** Buffered event pipeline that dispatches to one or more sinks. */
export class EventBuffer {
  private events: TelemetryEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly sinks: Sink[],
    private readonly maxBufferSize = 100,
    flushIntervalMs = 5000,
  ) {
    if (flushIntervalMs > 0) {
      this.flushInterval = setInterval(() => void this.flush(), flushIntervalMs);
    }
  }

  push(event: TelemetryEvent): void {
    this.events.push(event);
    if (this.events.length >= this.maxBufferSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    const batch = this.events.splice(0);
    await Promise.all(
      batch.flatMap((event) => this.sinks.map((sink) => sink.write(event))),
    );
    await Promise.all(this.sinks.map((sink) => sink.flush?.()));
  }

  async close(): Promise<void> {
    if (this.flushInterval) clearInterval(this.flushInterval);
    await this.flush();
    await Promise.all(this.sinks.map((sink) => sink.close?.()));
  }
}
