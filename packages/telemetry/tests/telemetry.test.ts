import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBuffer } from "../src/buffer.js";
import { createSpan, closeSpan } from "../src/trace.js";
import { createEvent } from "../src/events.js";
import { ConsoleSink } from "../src/local-sink.js";
import { redact } from "../src/redact.js";
import type { Sink } from "../src/sink.js";

function stubSink(name = "test"): Sink & { written: unknown[] } {
  const written: unknown[] = [];
  return {
    name,
    written,
    write(event) {
      written.push(event);
    },
    flush: vi.fn(),
    close: vi.fn(),
  };
}

describe("EventBuffer", () => {
  it("push stores events and flush sends them to sinks", async () => {
    const sink = stubSink();
    const buffer = new EventBuffer([sink], 100, 0);

    const evt1 = createEvent("job.created", "job_1");
    const evt2 = createEvent("job.claimed", "job_2");
    buffer.push(evt1);
    buffer.push(evt2);

    expect(sink.written).toHaveLength(0);

    await buffer.flush();

    expect(sink.written).toHaveLength(2);
    expect(sink.written[0]).toBe(evt1);
    expect(sink.written[1]).toBe(evt2);
  });

  it("flush clears the internal buffer", async () => {
    const sink = stubSink();
    const buffer = new EventBuffer([sink], 100, 0);

    buffer.push(createEvent("job.created", "job_1"));
    await buffer.flush();
    expect(sink.written).toHaveLength(1);

    await buffer.flush();
    // no new events written
    expect(sink.written).toHaveLength(1);
  });

  it("dispatches to multiple sinks", async () => {
    const sink1 = stubSink("s1");
    const sink2 = stubSink("s2");
    const buffer = new EventBuffer([sink1, sink2], 100, 0);

    buffer.push(createEvent("job.created", "job_1"));
    await buffer.flush();

    expect(sink1.written).toHaveLength(1);
    expect(sink2.written).toHaveLength(1);
  });

  it("close flushes remaining events and calls sink.close", async () => {
    const sink = stubSink();
    const buffer = new EventBuffer([sink], 100, 0);

    buffer.push(createEvent("job.created", "job_1"));
    await buffer.close();

    expect(sink.written).toHaveLength(1);
    expect(sink.close).toHaveBeenCalled();
  });
});

describe("createSpan / closeSpan", () => {
  it("creates a span with correct fields", () => {
    const span = createSpan("test-operation");

    expect(span.name).toBe("test-operation");
    expect(span.traceId).toBeDefined();
    expect(span.spanId).toBeDefined();
    expect(span.startTime).toBeDefined();
    expect(span.status).toBe("ok");
    expect(span.parentSpanId).toBeUndefined();
  });

  it("creates a span with parent ID", () => {
    const span = createSpan("child-op", "trace_123/span_456");

    expect(span.parentSpanId).toBe("trace_123/span_456");
    expect(span.traceId).toBe("trace_123");
  });

  it("closeSpan sets endTime and keeps status ok", () => {
    const span = createSpan("op");
    const closed = closeSpan(span);

    expect(closed.endTime).toBeDefined();
    expect(closed.status).toBe("ok");
    expect(closed.name).toBe("op");
    expect(closed.startTime).toBe(span.startTime);
  });

  it("closeSpan sets status to error and adds error attribute", () => {
    const span = createSpan("failing-op");
    const closed = closeSpan(span, "something went wrong");

    expect(closed.status).toBe("error");
    expect(closed.attributes?.error).toBe("something went wrong");
  });
});

describe("createEvent", () => {
  it("creates event with correct type and data", () => {
    const event = createEvent("job.created", "job_42", { source: "test" });

    expect(event.id).toBeDefined();
    expect(event.id).toMatch(/^evt_/);
    expect(event.type).toBe("job.created");
    expect(event.jobId).toBe("job_42");
    expect(event.timestamp).toBeDefined();
    expect(event.metadata).toEqual({ source: "test" });
  });

  it("creates event without optional fields", () => {
    const event = createEvent("job.resolved");

    expect(event.type).toBe("job.resolved");
    expect(event.jobId).toBeUndefined();
    expect(event.metadata).toBeUndefined();
  });
});

describe("ConsoleSink", () => {
  it("calling write does not throw", () => {
    const sink = new ConsoleSink();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(() => {
      sink.write(createEvent("job.created", "job_1"));
    }).not.toThrow();

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("has name 'console'", () => {
    const sink = new ConsoleSink();
    expect(sink.name).toBe("console");
  });
});

describe("redact", () => {
  it("removes sensitive fields from metadata", () => {
    const event = createEvent("job.created", "job_1", {
      apiKey: "secret-key-123",
      token: "bearer-xyz",
      password: "hunter2",
      normalField: "visible",
    });

    const redacted = redact(event);

    expect(redacted.metadata!.apiKey).toBe("[REDACTED]");
    expect(redacted.metadata!.token).toBe("[REDACTED]");
    expect(redacted.metadata!.password).toBe("[REDACTED]");
    expect(redacted.metadata!.normalField).toBe("visible");
  });

  it("returns event unchanged when no metadata", () => {
    const event = createEvent("job.created", "job_1");
    const redacted = redact(event);
    expect(redacted).toBe(event);
  });

  it("redacts 'secret' and 'credential' fields", () => {
    const event = createEvent("job.created", "job_1", {
      secret: "my-secret",
      credential: "cred-abc",
      safe: "ok",
    });

    const redacted = redact(event);

    expect(redacted.metadata!.secret).toBe("[REDACTED]");
    expect(redacted.metadata!.credential).toBe("[REDACTED]");
    expect(redacted.metadata!.safe).toBe("ok");
  });

  it("does not mutate the original event", () => {
    const event = createEvent("job.created", "job_1", { apiKey: "key" });
    const redacted = redact(event);

    expect(event.metadata!.apiKey).toBe("key");
    expect(redacted.metadata!.apiKey).toBe("[REDACTED]");
    expect(redacted).not.toBe(event);
  });
});
