import { describe, it, expect } from "vitest";
import { createWrapperTemplate } from "../src/templates.js";

describe("createWrapperTemplate", () => {
  it("creates a wrapper template with reviewers and strategy", () => {
    const template = createWrapperTemplate("safe_generate", {
      reviewers: [
        (output) => ({ score: typeof output === "string" ? 0.8 : 0.1, rationale: "Type check" }),
      ],
      strategy: { strategy: "threshold", threshold: 0.7 },
    });

    expect(template.name).toBe("safe_generate");
    expect(template.wrap).toBeTypeOf("function");
  });

  it("wrap() returns a consensus-gated function", async () => {
    const template = createWrapperTemplate("safe_generate", {
      reviewers: [() => ({ score: 0.9, rationale: "Looks good" })],
      strategy: { strategy: "threshold", threshold: 0.5 },
    });

    const safeFn = template.wrap(async (input: string) => `Response: ${input}`);
    const result = await safeFn("hello");
    expect(result.action).toBe("allow");
    expect(result.output).toBe("Response: hello");
  });

  it("wrap() blocks when reviewers score low", async () => {
    const template = createWrapperTemplate("strict_gate", {
      reviewers: [() => ({ score: 0.1, rationale: "Bad output" })],
      strategy: { strategy: "threshold", threshold: 0.7 },
      maxRetries: 0,
    });

    const safeFn = template.wrap(async () => "bad response");
    const result = await safeFn();
    expect(result.action).toBe("escalate");
    expect(result.aggregateScore).toBeLessThan(0.7);
  });

  it("wrap() respects hooks", async () => {
    const events: string[] = [];
    const template = createWrapperTemplate("hooked", {
      reviewers: [() => ({ score: 0.9, rationale: "OK" })],
      strategy: { strategy: "threshold", threshold: 0.5 },
      hooks: {
        beforeSubmit: () => { events.push("before"); },
        afterResolve: () => { events.push("after"); },
      },
    });

    const safeFn = template.wrap(async () => "output");
    await safeFn();
    expect(events).toEqual(["before", "after"]);
  });

  it("wrap() with maxRetries=0 escalates immediately on low score", async () => {
    const template = createWrapperTemplate("immediate_escalate", {
      reviewers: [() => ({ score: 0.2, rationale: "Very bad output" })],
      strategy: { strategy: "threshold", threshold: 0.7 },
      maxRetries: 0,
    });

    const safeFn = template.wrap(async () => "low quality response");
    const result = await safeFn();
    expect(result.action).toBe("escalate");
    expect(result.aggregateScore).toBeLessThan(0.7);
  });

  it("wrap() with sync function works", async () => {
    const template = createWrapperTemplate("sync_fn_test", {
      reviewers: [() => ({ score: 0.9, rationale: "OK" })],
      strategy: { strategy: "threshold", threshold: 0.5 },
    });

    const safeFn = template.wrap((input: string) => `sync: ${input}`);
    const result = await safeFn("hello");
    expect(result.action).toBe("allow");
    expect(result.output).toBe("sync: hello");
  });

  it("default description is generated from name", () => {
    const template = createWrapperTemplate("my_special_wrapper", {
      reviewers: [() => ({ score: 0.9, rationale: "OK" })],
      strategy: { strategy: "threshold", threshold: 0.5 },
    });

    expect(template.description).toContain("my_special_wrapper");
  });

  it("wrap() uses guard template asReviewer()", async () => {
    // Import createGuardTemplate to test the integration
    const { createGuardTemplate } = await import("@consensus-tools/guards");

    const guardTemplate = createGuardTemplate("safety_check", {
      rules: (payload) => {
        if (typeof payload["value"] === "string" && payload["value"].includes("bad")) {
          return [{ evaluator: "safety", vote: "NO", reason: "Contains bad content", risk: 0.9 }];
        }
        return [{ evaluator: "safety", vote: "YES", reason: "Clean", risk: 0.1 }];
      },
    });

    const template = createWrapperTemplate("guarded_fn", {
      reviewers: [guardTemplate.asReviewer()],
      strategy: { strategy: "threshold", threshold: 0.5 },
      maxRetries: 0,
    });

    const safeFn = template.wrap(async (input: string) => input);

    const good = await safeFn("hello world");
    expect(good.action).toBe("allow");

    const bad = await safeFn("bad content here");
    expect(bad.action).not.toBe("allow");
  });
});
