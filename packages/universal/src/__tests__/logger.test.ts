import { describe, it, expect, vi } from "vitest";
import { createLogger } from "../logger.js";
import type { LogEvent } from "../types.js";

describe("createLogger", () => {
  it("emits deliberation.start event via beforeSubmit hook", () => {
    const logFn = vi.fn<(event: LogEvent) => void>();
    const hooks = createLogger({ logger: logFn });

    hooks.beforeSubmit!(["arg1", "arg2"]);

    expect(logFn).toHaveBeenCalledOnce();
    const event = logFn.mock.calls[0]![0];
    expect(event.event).toBe("deliberation.start");
    expect(event.data).toEqual({ args: ["arg1", "arg2"] });
    expect(typeof event.timestamp).toBe("number");
  });

  it("emits deliberation.result event via afterResolve hook", () => {
    const logFn = vi.fn<(event: LogEvent) => void>();
    const hooks = createLogger({ logger: logFn });

    const mockResult = {
      action: "allow" as const,
      output: "ok",
      scores: [{ score: 0.9, rationale: "safe" }],
      aggregateScore: 0.9,
      attempt: 1,
    };

    hooks.afterResolve!(mockResult);

    expect(logFn).toHaveBeenCalledOnce();
    const event = logFn.mock.calls[0]![0];
    expect(event.event).toBe("deliberation.result");
    expect(event.data).toEqual({
      action: "allow",
      aggregateScore: 0.9,
      attempt: 1,
      scoresCount: 1,
    });
  });

  it("emits deliberation.error-level event via onBlock hook", () => {
    const logFn = vi.fn<(event: LogEvent) => void>();
    const hooks = createLogger({ logger: logFn });

    const mockResult = {
      action: "block" as const,
      output: null,
      scores: [{ score: 0, rationale: "blocked" }],
      aggregateScore: 0,
      attempt: 1,
    };

    hooks.onBlock!(mockResult);

    expect(logFn).toHaveBeenCalledOnce();
    const event = logFn.mock.calls[0]![0];
    expect(event.event).toBe("deliberation.result");
    expect(event.data.action).toBe("block");
  });

  it("returns empty hooks when logger is false (suppresses all events)", () => {
    const hooks = createLogger({ logger: false });

    expect(hooks.beforeSubmit).toBeUndefined();
    expect(hooks.afterResolve).toBeUndefined();
    expect(hooks.onBlock).toBeUndefined();
    expect(hooks.onEscalate).toBeUndefined();
  });

  it("uses custom logger function to receive events", () => {
    const events: LogEvent[] = [];
    const customLogger = (event: LogEvent) => {
      events.push(event);
    };
    const hooks = createLogger({ logger: customLogger });

    hooks.beforeSubmit!(["hello"]);
    hooks.afterResolve!({
      action: "allow",
      output: "world",
      scores: [],
      aggregateScore: 1.0,
      attempt: 1,
    });

    expect(events).toHaveLength(2);
    expect(events[0]!.event).toBe("deliberation.start");
    expect(events[1]!.event).toBe("deliberation.result");
  });
});
