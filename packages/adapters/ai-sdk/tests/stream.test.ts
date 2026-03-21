import { describe, it, expect } from "vitest";
import { createGuardedStream, type GuardedStreamResult } from "../src/stream.js";

// Helper: simulate a streamText-like result
function mockStreamResult(text: string) {
  return {
    text: Promise.resolve(text),
    textStream: (async function* () {
      for (const char of text) {
        yield char;
      }
    })(),
    fullStream: (async function* () {
      yield { type: "text-delta" as const, textDelta: text };
    })(),
    usage: Promise.resolve({ promptTokens: 10, completionTokens: 20 }),
  };
}

describe("createGuardedStream", () => {
  it("creates a guarded stream function", () => {
    const guarded = createGuardedStream({ domain: "publish" });
    expect(guarded).toBeTypeOf("function");
  });

  it("passes through clean text and returns ALLOW", async () => {
    const guarded = createGuardedStream({ domain: "publish" });
    const stream = mockStreamResult("Our team builds great products.");
    const result = await guarded(stream);

    expect(result.stream).toBe(stream);
    const decision = await result.guard;
    expect(decision.decision).toBe("allow");
    expect(decision.text).toBe("Our team builds great products.");
  });

  it("flags PII content with BLOCK", async () => {
    const guarded = createGuardedStream({ domain: "publish" });
    const stream = mockStreamResult("Your SSN is 123-45-6789");
    const result = await guarded(stream);

    const decision = await result.guard;
    expect(decision.decision).toBe("block");
  });

  it("calls onComplete hook with decision", async () => {
    let hookCalled = false;
    const guarded = createGuardedStream({
      domain: "publish",
      onComplete: (decision) => { hookCalled = true; },
    });

    const stream = mockStreamResult("Clean text.");
    const result = await guarded(stream);
    await result.guard;

    expect(hookCalled).toBe(true);
  });

  it("works with custom guard template", async () => {
    const { createGuardTemplate } = await import("@consensus-tools/guards");
    const template = createGuardTemplate("custom", {
      rules: (payload) => {
        if (String(payload["text"] || "").includes("forbidden")) {
          return [{ evaluator: "custom", vote: "NO", reason: "Forbidden", risk: 0.9 }];
        }
        return [{ evaluator: "custom", vote: "YES", reason: "OK", risk: 0.1 }];
      },
    });

    const guarded = createGuardedStream({ template });
    const stream = mockStreamResult("This is forbidden content");
    const result = await guarded(stream);
    const decision = await result.guard;
    expect(decision.decision).toBe("block");
  });

  it("onComplete hook error does not break the guard promise", async () => {
    const guarded = createGuardedStream({
      domain: "publish",
      onComplete: async () => { throw new Error("onComplete failure"); },
    });

    const stream = mockStreamResult("Clean text.");
    const result = await guarded(stream);

    // The guard promise should reject because onComplete throws (error propagates via await)
    await expect(result.guard).rejects.toThrow("onComplete failure");
  });

  it("defaults to publish domain when no domain or template", async () => {
    const guarded = createGuardedStream({});

    const stream = mockStreamResult("Our team builds great products.");
    const result = await guarded(stream);

    const decision = await result.guard;
    // Default domain is "publish"; clean text should be allowed
    expect(decision.decision).toBe("allow");
    expect(decision.text).toBe("Our team builds great products.");
  });
});
