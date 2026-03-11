import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { consensus } from "../consensus.js";
import type { ReviewerFn, ReviewResult } from "../types.js";

describe("consensus wrapper", () => {
  // ── basic decisions ─────────────────────────────────────────────────

  it("allows when all reviewers score high", async () => {
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "hello",
      reviewers: [() => ({ score: 0.9 }), () => ({ score: 0.8 })],
    });
    const result = await wrapped();
    assert.equal(result.action, "allow");
    assert.equal(result.output, "hello");
    assert.equal(result.scores.length, 2);
  });

  it("blocks when a reviewer sets block: true", async () => {
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "bad output",
      reviewers: [
        () => ({ score: 1.0 }),
        () => ({ score: 0.9, block: true }),
      ],
    });
    const result = await wrapped();
    assert.equal(result.action, "block");
  });

  it("retries once then escalates with default maxRetries=1", async () => {
    let callCount = 0;
    const wrapped = consensus<string>({
      name: "test",
      fn: () => {
        callCount++;
        return "weak";
      },
      reviewers: [() => ({ score: 0.1 })],
    });
    const result = await wrapped();
    // maxRetries=1: attempt 1 retries (1 <= 1), attempt 2 escalates (2 <= 1 false)
    assert.equal(result.action, "escalate");
    assert.equal(callCount, 2);
    assert.equal(result.attempt, 2);
  });

  it("escalates immediately with maxRetries=0", async () => {
    let callCount = 0;
    const wrapped = consensus<string>({
      name: "test",
      fn: () => {
        callCount++;
        return "weak";
      },
      reviewers: [() => ({ score: 0.1 })],
      maxRetries: 0,
    });
    const result = await wrapped();
    assert.equal(result.action, "escalate");
    assert.equal(callCount, 1);
  });

  // ── strategy forwarding ─────────────────────────────────────────────

  it("uses unanimous strategy", async () => {
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "output",
      reviewers: [() => ({ score: 0.9 }), () => ({ score: 0.3 })],
      strategy: { strategy: "unanimous", threshold: 0.5 },
      maxRetries: 0,
    });
    const result = await wrapped();
    // One reviewer below threshold, unanimous fails, no retries → escalate
    assert.equal(result.action, "escalate");
  });

  it("uses majority strategy — passes when majority above threshold", async () => {
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "output",
      reviewers: [
        () => ({ score: 0.9 }),
        () => ({ score: 0.8 }),
        () => ({ score: 0.1 }),
      ],
      strategy: { strategy: "majority", threshold: 0.5 },
    });
    const result = await wrapped();
    assert.equal(result.action, "allow");
  });

  it("respects custom threshold", async () => {
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "output",
      reviewers: [() => ({ score: 0.7 })],
      strategy: { strategy: "threshold", threshold: 0.8 },
      maxRetries: 0,
    });
    const result = await wrapped();
    assert.equal(result.action, "escalate");
  });

  // ── retry behavior ──────────────────────────────────────────────────

  it("retries and eventually allows when scores improve", async () => {
    let callCount = 0;
    const reviewer: ReviewerFn<string> = (_output, ctx) => {
      // Fail on attempt 1, pass on attempt 2
      return { score: ctx.attempt === 1 ? 0.1 : 0.9 };
    };
    const wrapped = consensus<string>({
      name: "test",
      fn: () => {
        callCount++;
        return "output";
      },
      reviewers: [reviewer],
      maxRetries: 1,
    });
    const result = await wrapped();
    assert.equal(result.action, "allow");
    assert.equal(result.attempt, 2);
    assert.equal(callCount, 2);
  });

  it("escalates after all retries exhausted", async () => {
    let callCount = 0;
    const wrapped = consensus<string>({
      name: "test",
      fn: () => {
        callCount++;
        return "bad";
      },
      reviewers: [() => ({ score: 0.1 })],
      maxRetries: 3,
    });
    const result = await wrapped();
    assert.equal(result.action, "escalate");
    // maxRetries=3: attempts 1,2,3 retry (attempt <= 3), attempt 4 escalates
    assert.equal(callCount, 4);
  });

  it("blocks immediately even if retries remain", async () => {
    let callCount = 0;
    const wrapped = consensus<string>({
      name: "test",
      fn: () => {
        callCount++;
        return "blocked";
      },
      reviewers: [() => ({ score: 0.1, block: true })],
      maxRetries: 5,
    });
    const result = await wrapped();
    assert.equal(result.action, "block");
    assert.equal(callCount, 1);
  });

  // ── argument passthrough ────────────────────────────────────────────

  it("passes arguments to the wrapped function", async () => {
    const fn = (...args: unknown[]) => args;
    const wrapped = consensus<unknown[]>({
      name: "test",
      fn,
      reviewers: [() => ({ score: 1.0 })],
    });
    const result = await wrapped("a", 42, true);
    assert.deepEqual(result.output, ["a", 42, true]);
  });

  // ── reviewer context ────────────────────────────────────────────────

  it("passes correct context to reviewers", async () => {
    let capturedCtx: unknown;
    const wrapped = consensus<string>({
      name: "myFunc",
      fn: () => "out",
      reviewers: [
        (_output, ctx) => {
          capturedCtx = ctx;
          return { score: 1.0 };
        },
      ],
    });
    await wrapped("arg1", "arg2");
    assert.deepEqual(capturedCtx, {
      name: "myFunc",
      args: ["arg1", "arg2"],
      attempt: 1,
    });
  });

  it("increments attempt number on retries", async () => {
    const attempts: number[] = [];
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [
        (_output, ctx) => {
          attempts.push(ctx.attempt);
          return { score: ctx.attempt >= 3 ? 0.9 : 0.1 };
        },
      ],
      maxRetries: 2,
    });
    await wrapped();
    assert.deepEqual(attempts, [1, 2, 3]);
  });

  // ── async support ──────────────────────────────────────────────────

  it("works with async wrapped function", async () => {
    const wrapped = consensus<string>({
      name: "test",
      fn: async () => {
        return "async result";
      },
      reviewers: [() => ({ score: 0.9 })],
    });
    const result = await wrapped();
    assert.equal(result.output, "async result");
    assert.equal(result.action, "allow");
  });

  it("works with async reviewers", async () => {
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [
        async () => ({ score: 0.8, rationale: "async review" }),
      ],
    });
    const result = await wrapped();
    assert.equal(result.action, "allow");
    assert.equal(result.scores[0]?.rationale, "async review");
  });

  it("works with sync reviewers returning plain objects", async () => {
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [() => ({ score: 0.9 })],
    });
    const result = await wrapped();
    assert.equal(result.action, "allow");
  });

  // ── edge cases ──────────────────────────────────────────────────────

  it("handles empty reviewers array", async () => {
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [],
      maxRetries: 0,
    });
    const result = await wrapped();
    // No reviewers → avg is 0 → below default threshold 0.5 → escalate
    assert.equal(result.action, "escalate");
  });

  it("handles single reviewer", async () => {
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [() => ({ score: 0.7 })],
    });
    const result = await wrapped();
    assert.equal(result.action, "allow");
    assert.equal(result.aggregateScore, 0.7);
  });

  it("calls all reviewers in parallel", async () => {
    const order: string[] = [];
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [
        async () => {
          order.push("r1-start");
          await new Promise((r) => setTimeout(r, 10));
          order.push("r1-end");
          return { score: 0.9 };
        },
        async () => {
          order.push("r2-start");
          await new Promise((r) => setTimeout(r, 10));
          order.push("r2-end");
          return { score: 0.8 };
        },
      ],
    });
    await wrapped();
    // Both should start before either ends (parallel execution)
    assert.equal(order[0], "r1-start");
    assert.equal(order[1], "r2-start");
  });
});
