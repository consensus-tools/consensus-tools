import { describe, it, expect, vi, beforeEach } from "vitest";
import { LangSmithTracer } from "../src/tracer.js";

// Mock langsmith client — we don't want real API calls in tests
vi.mock("langsmith", () => ({
  Client: class MockClient {
    createRun = vi.fn().mockResolvedValue(undefined);
    updateRun = vi.fn().mockResolvedValue(undefined);
  },
}));

describe("LangSmithTracer", () => {
  let tracer: LangSmithTracer;

  beforeEach(() => {
    tracer = new LangSmithTracer({ projectName: "test-project" });
  });

  it("creates a tracer with project name", () => {
    expect(tracer).toBeTruthy();
    expect(tracer.projectName).toBe("test-project");
  });

  it("traceGuardDecision sends a trace with correct structure", async () => {
    const spy = vi.spyOn(tracer, "traceGuardDecision");

    await tracer.traceGuardDecision({
      domain: "publish",
      decision: "ALLOW",
      risk: 0.2,
      votes: [
        { evaluator: "publish-risk", vote: "YES", reason: "Clean text", risk: 0.2 },
      ],
      input: { text: "Hello world" },
      durationMs: 15,
    });

    expect(spy).toHaveBeenCalledOnce();
  });

  it("traceWrapperDecision sends a trace for wrapper results", async () => {
    const spy = vi.spyOn(tracer, "traceWrapperDecision");

    await tracer.traceWrapperDecision({
      name: "safe_generate",
      action: "allow",
      aggregateScore: 0.85,
      scores: [
        { score: 0.9, rationale: "Clean" },
        { score: 0.8, rationale: "Relevant" },
      ],
      attempt: 1,
      durationMs: 25,
    });

    expect(spy).toHaveBeenCalledOnce();
  });

  it("getTraceUrl returns a LangSmith URL", () => {
    const url = tracer.getTraceUrl("run-123");
    expect(url).toContain("smith.langchain.com");
    expect(url).toContain("test-project");
  });

  it("defaults project name to consensus-tools", () => {
    const t = new LangSmithTracer();
    expect(t.projectName).toBe("consensus-tools");
  });
});
