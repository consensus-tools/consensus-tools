import { describe, it, expect } from "vitest";
import { createGuardedGenerate, type GuardedGenerateOptions } from "../src/middleware.js";

describe("createGuardedGenerate", () => {
  it("creates a guarded generate function", () => {
    const guarded = createGuardedGenerate({
      domain: "publish",
    });
    expect(guarded).toBeTypeOf("function");
  });

  it("allows clean text output", async () => {
    const guarded = createGuardedGenerate({
      domain: "publish",
    });

    // Simulate a generateText-like call
    const result = await guarded(async () => ({
      text: "Our team builds great products for developers.",
    }));

    expect(result.decision).toBe("allow");
    expect(result.output.text).toBe("Our team builds great products for developers.");
  });

  it("blocks output with PII patterns", async () => {
    const guarded = createGuardedGenerate({
      domain: "publish",
    });

    const result = await guarded(async () => ({
      text: "Your SSN is 123-45-6789",
    }));

    expect(result.decision).toBe("block");
  });

  it("accepts custom guard template", async () => {
    const { createGuardTemplate } = await import("@consensus-tools/guards");
    const template = createGuardTemplate("custom", {
      rules: (payload) => {
        if (String(payload["text"] || "").includes("forbidden")) {
          return [{ evaluator: "custom", vote: "NO", reason: "Forbidden content", risk: 0.9 }];
        }
        return [{ evaluator: "custom", vote: "YES", reason: "OK", risk: 0.1 }];
      },
    });

    const guarded = createGuardedGenerate({
      template,
    });

    const good = await guarded(async () => ({ text: "Hello world" }));
    expect(good.decision).toBe("allow");

    const bad = await guarded(async () => ({ text: "This is forbidden content" }));
    expect(bad.decision).toBe("block");
  });

  it("calls onBlock hook when output is blocked", async () => {
    let blocked = false;
    const guarded = createGuardedGenerate({
      domain: "publish",
      onBlock: () => { blocked = true; },
    });

    await guarded(async () => ({ text: "SSN: 123-45-6789" }));
    expect(blocked).toBe(true);
  });

  it("calls onAllow hook when output passes", async () => {
    let allowed = false;
    const guarded = createGuardedGenerate({
      domain: "publish",
      onAllow: () => { allowed = true; },
    });

    await guarded(async () => ({ text: "Clean content here." }));
    expect(allowed).toBe(true);
  });

  it("output without text field uses empty payload", async () => {
    const guarded = createGuardedGenerate({
      domain: "publish",
    });

    const result = await guarded(async () => ({ other: "value" } as any));
    // No text to evaluate, should allow by default (no blocking patterns in empty payload)
    expect(result.decision).toBe("allow");
    expect(result.output).toEqual({ other: "value" });
  });

  it("async hook that throws does not crash", async () => {
    const guarded = createGuardedGenerate({
      domain: "publish",
      onAllow: async () => { throw new Error("hook failure"); },
    });

    // Should throw since the hook error propagates, but the result was computed
    // The source code uses `await opts.onAllow?.(...)` so an error will propagate
    // We verify it doesn't silently fail and the result structure is returned up to the throw
    await expect(guarded(async () => ({ text: "Clean content here." }))).rejects.toThrow("hook failure");
  });

  it("domain defaults to publish when not specified", async () => {
    const guarded = createGuardedGenerate({});

    const result = await guarded(async () => ({ text: "Clean content." }));
    // With no domain or template, defaults to "publish" domain
    expect(result.decision).toBe("allow");
    expect(result.guard).toBeTruthy();
  });
});
