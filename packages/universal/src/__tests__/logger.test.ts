import { describe, it, expect, vi } from "vitest";
import { createLogger } from "../logger.js";
import type { LogEvent, LlmDecisionResult } from "../types.js";

function makeDecision(overrides: Partial<LlmDecisionResult> = {}): LlmDecisionResult {
  return {
    decisionId: "dec_test",
    action: "allow",
    votes: [
      { personaId: "p1", personaName: "Persona One", vote: "YES", confidence: 0.9, rationale: "ok", source: "regex" },
    ],
    policy: "MAJORITY_VOTE",
    consensusTrace: {},
    aggregateScore: 0.9,
    ...overrides,
  };
}

describe("createLogger", () => {
  it("emits deliberation.start event via .start()", () => {
    const logFn = vi.fn<(event: LogEvent) => void>();
    const emitter = createLogger({ logger: logFn });

    emitter.start(["arg1", "arg2"]);

    expect(logFn).toHaveBeenCalledOnce();
    const event = logFn.mock.calls[0]![0];
    expect(event.event).toBe("deliberation.start");
    expect(event.data).toEqual({ args: ["arg1", "arg2"] });
    expect(typeof event.timestamp).toBe("number");
  });

  it("emits deliberation.result event via .result()", () => {
    const logFn = vi.fn<(event: LogEvent) => void>();
    const emitter = createLogger({ logger: logFn });

    emitter.result(makeDecision({ action: "allow", aggregateScore: 0.9 }));

    expect(logFn).toHaveBeenCalledOnce();
    const event = logFn.mock.calls[0]![0];
    expect(event.event).toBe("deliberation.result");
    expect(event.data).toEqual({
      action: "allow",
      aggregateScore: 0.9,
      policy: "MAJORITY_VOTE",
      decisionId: "dec_test",
      voteCount: 1,
    });
  });

  it("emits deliberation.result on block too (no separate hook)", () => {
    const logFn = vi.fn<(event: LogEvent) => void>();
    const emitter = createLogger({ logger: logFn });

    emitter.result(makeDecision({ action: "block", aggregateScore: 0 }));

    expect(logFn).toHaveBeenCalledOnce();
    const event = logFn.mock.calls[0]![0];
    expect(event.event).toBe("deliberation.result");
    expect(event.data.action).toBe("block");
  });

  it("emits persona.respawned event via .respawn()", () => {
    const logFn = vi.fn<(event: LogEvent) => void>();
    const emitter = createLogger({ logger: logFn });

    emitter.respawn({
      oldPersonaId: "p1",
      newPersonaId: "p1-v2",
      reputation: 0.05,
      reason: "low_reputation",
    });

    expect(logFn).toHaveBeenCalledOnce();
    const event = logFn.mock.calls[0]![0];
    expect(event.event).toBe("persona.respawned");
    expect(event.data).toEqual({
      oldPersonaId: "p1",
      newPersonaId: "p1-v2",
      reputation: 0.05,
      reason: "low_reputation",
    });
  });

  it("returns a no-op emitter when logger is false", () => {
    const emitter = createLogger({ logger: false });

    // Calling these should not throw and should not emit anywhere visible
    expect(() => emitter.start(["x"])).not.toThrow();
    expect(() => emitter.result(makeDecision())).not.toThrow();
    expect(() => emitter.respawn({ oldPersonaId: "a", newPersonaId: "b", reputation: 0, reason: "" })).not.toThrow();
  });

  it("uses custom logger function to receive events", () => {
    const events: LogEvent[] = [];
    const customLogger = (event: LogEvent) => { events.push(event); };
    const emitter = createLogger({ logger: customLogger });

    emitter.start(["hello"]);
    emitter.result(makeDecision({ action: "allow", aggregateScore: 1.0 }));

    expect(events).toHaveLength(2);
    expect(events[0]!.event).toBe("deliberation.start");
    expect(events[1]!.event).toBe("deliberation.result");
  });
});
