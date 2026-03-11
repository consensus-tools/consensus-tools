import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { consensus } from "../consensus.js";
import type { DecisionResult } from "../types.js";

describe("consensus lifecycle hooks", () => {
  it("calls beforeSubmit with args before function executes", async () => {
    const callOrder: string[] = [];
    const wrapped = consensus<string>({
      name: "test",
      fn: () => {
        callOrder.push("fn");
        return "out";
      },
      reviewers: [() => ({ score: 0.9 })],
      hooks: {
        beforeSubmit: (args) => {
          callOrder.push("beforeSubmit");
          assert.deepEqual(args, ["a", "b"]);
        },
      },
    });
    await wrapped("a", "b");
    assert.equal(callOrder[0], "beforeSubmit");
    assert.equal(callOrder[1], "fn");
  });

  it("calls afterResolve on allow", async () => {
    let captured: DecisionResult<string> | undefined;
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [() => ({ score: 0.9 })],
      hooks: {
        afterResolve: (result) => {
          captured = result;
        },
      },
    });
    await wrapped();
    assert.equal(captured?.action, "allow");
    assert.equal(captured?.output, "out");
  });

  it("calls onBlock on block", async () => {
    let captured: DecisionResult<string> | undefined;
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [() => ({ score: 0.9, block: true })],
      hooks: {
        onBlock: (result) => {
          captured = result;
        },
      },
    });
    await wrapped();
    assert.equal(captured?.action, "block");
  });

  it("calls onEscalate on escalate", async () => {
    let captured: DecisionResult<string> | undefined;
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [() => ({ score: 0.1 })],
      hooks: {
        onEscalate: (result) => {
          captured = result;
        },
      },
    });
    await wrapped();
    assert.equal(captured?.action, "escalate");
  });

  it("does not call afterResolve on block", async () => {
    let afterResolveCalled = false;
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [() => ({ score: 0.9, block: true })],
      hooks: {
        afterResolve: () => {
          afterResolveCalled = true;
        },
        onBlock: () => {},
      },
    });
    await wrapped();
    assert.equal(afterResolveCalled, false);
  });

  it("does not call onBlock on allow", async () => {
    let onBlockCalled = false;
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [() => ({ score: 0.9 })],
      hooks: {
        onBlock: () => {
          onBlockCalled = true;
        },
      },
    });
    await wrapped();
    assert.equal(onBlockCalled, false);
  });

  it("works without any hooks provided", async () => {
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [() => ({ score: 0.9 })],
    });
    const result = await wrapped();
    assert.equal(result.action, "allow");
  });

  it("awaits async hooks", async () => {
    let hookCompleted = false;
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [() => ({ score: 0.9 })],
      hooks: {
        afterResolve: async () => {
          await new Promise((r) => setTimeout(r, 10));
          hookCompleted = true;
        },
      },
    });
    await wrapped();
    assert.equal(hookCompleted, true);
  });

  it("calls beforeSubmit on each retry attempt", async () => {
    let beforeSubmitCount = 0;
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [
        (_output, ctx) => ({ score: ctx.attempt >= 3 ? 0.9 : 0.1 }),
      ],
      maxRetries: 2,
      hooks: {
        beforeSubmit: () => {
          beforeSubmitCount++;
        },
      },
    });
    await wrapped();
    // attempts 1,2 retry, attempt 3 allows → 3 beforeSubmit calls
    assert.equal(beforeSubmitCount, 3);
  });

  it("does not call afterResolve on retry attempts, only on final allow", async () => {
    let afterResolveCount = 0;
    const wrapped = consensus<string>({
      name: "test",
      fn: () => "out",
      reviewers: [
        (_output, ctx) => ({ score: ctx.attempt >= 2 ? 0.9 : 0.1 }),
      ],
      maxRetries: 1,
      hooks: {
        afterResolve: () => {
          afterResolveCount++;
        },
      },
    });
    await wrapped();
    assert.equal(afterResolveCount, 1);
  });
});
