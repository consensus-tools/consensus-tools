import { describe, it, expect, vi } from "vitest";
import { consensus } from "./index.js";
import type { ModelAdapter, ModelMessage, LlmDecisionResult, FeedbackSignal } from "./types.js";

function createAllowModel(): ModelAdapter {
  return async (_messages: ModelMessage[]) =>
    "VOTE: YES\nCONFIDENCE: 0.9\nRATIONALE: Looks safe.";
}

function createBlockModel(): ModelAdapter {
  return async (_messages: ModelMessage[]) =>
    "VOTE: NO\nCONFIDENCE: 0.9\nRATIONALE: Dangerous.";
}

function createMockExecutor() {
  return vi.fn(async (toolName: string, args: Record<string, unknown>) => {
    return { tool: toolName, result: "executed", args };
  });
}

describe("LLM mode .feedback() wiring", () => {
  it("returns an executor with a .feedback method in LLM mode", () => {
    const executor = createMockExecutor();
    const safe = consensus.wrap(executor, {
      model: createAllowModel(),
      logger: false,
    });
    expect(typeof (safe as any).feedback).toBe("function");
  });

  it("does NOT have .feedback in regex mode", () => {
    const executor = createMockExecutor();
    const safe = consensus.wrap(executor);
    expect((safe as any).feedback).toBeUndefined();
  });

  it(".feedback() processes signal without throwing", async () => {
    const decisions: LlmDecisionResult[] = [];
    const executor = createMockExecutor();
    const safe = consensus.wrap(executor, {
      model: createBlockModel(),
      failPolicy: "open",
      onDecision: (d) => { decisions.push(d as LlmDecisionResult); },
      logger: false,
    });

    await safe("send_email", { to: "test@test.com" });
    const decisionId = decisions[0]!.decisionId;

    const feedbackFn = (safe as any).feedback as (signal: FeedbackSignal) => void;
    expect(() => feedbackFn({ decisionId, type: "override_block" })).not.toThrow();
  });

  it("fires onFeedback notification after processing feedback", async () => {
    const onFeedback = vi.fn();
    const decisions: LlmDecisionResult[] = [];
    const executor = createMockExecutor();

    const safe = consensus.wrap(executor, {
      model: createBlockModel(),
      failPolicy: "open",
      onDecision: (d) => { decisions.push(d as LlmDecisionResult); },
      onFeedback,
      logger: false,
    });

    await safe("send_email", { to: "test@test.com" });
    const decisionId = decisions[0]!.decisionId;

    const feedbackFn = (safe as any).feedback as (signal: FeedbackSignal) => void;
    feedbackFn({ decisionId, type: "override_block" });

    expect(onFeedback).toHaveBeenCalledWith({ decisionId, type: "override_block" });
  });
});
