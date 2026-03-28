import { describe, it, expect, vi } from "vitest";
import { consensus } from "./index.js";
import { ConsensusBlockedError } from "./errors.js";
import type { ModelAdapter, ModelMessage, LlmDecisionResult } from "./types.js";

// ── Mock Model Adapter ──────────────────────────────────────────────

function createMockModel(response: string): ModelAdapter {
  return async (_messages: ModelMessage[]) => response;
}

function createAllowModel(): ModelAdapter {
  return createMockModel("VOTE: YES\nCONFIDENCE: 0.9\nRATIONALE: Looks safe to proceed.");
}

function createBlockModel(): ModelAdapter {
  return createMockModel("VOTE: NO\nCONFIDENCE: 0.95\nRATIONALE: This action is dangerous.");
}

function createFailingModel(): ModelAdapter {
  return async () => { throw new Error("LLM unavailable"); };
}

function createSlowModel(delayMs: number): ModelAdapter {
  return async () => {
    await new Promise((r) => setTimeout(r, delayMs));
    return "VOTE: YES\nCONFIDENCE: 0.8\nRATIONALE: ok";
  };
}

// ── Mock Executor ────────────────────────────────────────────────────

function createMockExecutor() {
  return vi.fn(async (toolName: string, args: Record<string, unknown>) => {
    return { tool: toolName, result: "executed", args };
  });
}

// ── Tests ────────────────────────────────────────────────────────────

describe("consensus.wrap with LLM persona mode", () => {
  describe("backward compatibility", () => {
    it("works without model (regex-only mode)", async () => {
      const executor = createMockExecutor();
      const safe = consensus.wrap(executor);
      const result = await safe("get_weather", { city: "SF" });
      expect(executor).toHaveBeenCalledWith("get_weather", { city: "SF" });
      expect(result).toEqual({ tool: "get_weather", result: "executed", args: { city: "SF" } });
    });
  });

  describe("LLM persona mode - allow", () => {
    it("allows safe tool calls when all personas vote YES", async () => {
      const executor = createMockExecutor();
      const safe = consensus.wrap(executor, {
        model: createAllowModel(),
        logger: false,
      });
      const result = await safe("send_email", { to: "user@test.com", body: "hello" });
      expect(executor).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("LLM persona mode - block", () => {
    it("blocks dangerous tool calls when personas vote NO", async () => {
      const executor = createMockExecutor();
      const safe = consensus.wrap(executor, {
        model: createBlockModel(),
        failPolicy: "closed",
        logger: false,
      });
      await expect(
        safe("delete_database", { target: "production" }),
      ).rejects.toThrow(ConsensusBlockedError);
      expect(executor).not.toHaveBeenCalled();
    });
  });

  describe("shadow mode", () => {
    it("never blocks in shadow mode, even when personas vote NO", async () => {
      const executor = createMockExecutor();
      const safe = consensus.wrap(executor, {
        model: createBlockModel(),
        mode: "shadow",
        logger: false,
      });
      const result = await safe("delete_database", { target: "production" });
      expect(executor).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it("still fires onDecision in shadow mode", async () => {
      const onDecision = vi.fn();
      const executor = createMockExecutor();
      const safe = consensus.wrap(executor, {
        model: createBlockModel(),
        mode: "shadow",
        onDecision,
        logger: false,
      });
      await safe("delete_database", {});
      expect(onDecision).toHaveBeenCalled();
      const decision = onDecision.mock.calls[0]![0] as LlmDecisionResult;
      expect(decision.action).toBe("block");
    });
  });

  describe("fast-path (low-risk tools)", () => {
    it("skips LLM calls for low-risk tools", async () => {
      const modelCalls: ModelMessage[][] = [];
      const model: ModelAdapter = async (msgs) => {
        modelCalls.push(msgs);
        return "VOTE: YES\nCONFIDENCE: 0.9\nRATIONALE: ok";
      };

      const executor = createMockExecutor();
      const safe = consensus.wrap(executor, { model, logger: false });
      await safe("get_weather", { city: "SF" });

      // Low-risk tool should not trigger LLM calls
      expect(modelCalls.length).toBe(0);
      expect(executor).toHaveBeenCalled();
    });

    it("runs full LLM deliberation for high-risk tools", async () => {
      const modelCalls: ModelMessage[][] = [];
      const model: ModelAdapter = async (msgs) => {
        modelCalls.push(msgs);
        return "VOTE: YES\nCONFIDENCE: 0.9\nRATIONALE: ok";
      };

      const executor = createMockExecutor();
      const safe = consensus.wrap(executor, { model, logger: false });
      await safe("send_email", { to: "user@test.com" });

      // High-risk tool should trigger 3 LLM calls (one per persona)
      expect(modelCalls.length).toBe(3);
    });
  });

  describe("LLM failure fallback", () => {
    it("falls back to regex when all LLM calls fail", async () => {
      const executor = createMockExecutor();
      const safe = consensus.wrap(executor, {
        model: createFailingModel(),
        failPolicy: "open",
        logger: false,
      });
      // Should not throw, should fall back to regex and likely allow
      const result = await safe("send_email", { to: "user@test.com", body: "hello" });
      expect(result).toBeDefined();
    });
  });

  describe("per-persona timeout", () => {
    it("falls back to regex for timed-out personas and blocks (fail-closed)", async () => {
      const onDecision = vi.fn();
      const executor = createMockExecutor();
      const safe = consensus.wrap(executor, {
        model: createSlowModel(5000),
        personaTimeout: 100,
        onDecision,
        logger: false,
      });
      // LLM times out, regex fallback votes NO (fail-closed), tool is blocked
      await expect(safe("send_email", { to: "user@test.com" })).rejects.toThrow(ConsensusBlockedError);
      expect(executor).not.toHaveBeenCalled();
      // onDecision should still fire with regex_fallback votes
      expect(onDecision).toHaveBeenCalled();
      const decision = onDecision.mock.calls[0]![0] as LlmDecisionResult;
      expect(decision.votes.every((v) => v.source === "regex_fallback")).toBe(true);
    });

    it("allows with failPolicy open when LLM times out", async () => {
      const executor = createMockExecutor();
      const safe = consensus.wrap(executor, {
        model: createSlowModel(5000),
        personaTimeout: 100,
        failPolicy: "open",
        logger: false,
      });
      // failPolicy open: even if regex fallback blocks, tool executes
      const result = await safe("send_email", { to: "user@test.com" });
      expect(result).toBeDefined();
    });
  });

  describe("onDecision callback", () => {
    it("receives LlmDecisionResult with vote breakdown", async () => {
      const onDecision = vi.fn();
      const executor = createMockExecutor();
      const safe = consensus.wrap(executor, {
        model: createAllowModel(),
        onDecision,
        logger: false,
      });
      await safe("send_email", { to: "test@test.com" });

      expect(onDecision).toHaveBeenCalledTimes(1);
      const decision = onDecision.mock.calls[0]![0] as LlmDecisionResult;
      expect(decision.decisionId).toBeDefined();
      expect(decision.action).toBe("allow");
      expect(decision.votes.length).toBe(3);
      expect(decision.votes[0]).toHaveProperty("personaId");
      expect(decision.votes[0]).toHaveProperty("personaName");
      expect(decision.votes[0]).toHaveProperty("vote");
      expect(decision.votes[0]).toHaveProperty("confidence");
      expect(decision.votes[0]).toHaveProperty("rationale");
      expect(decision.votes[0]).toHaveProperty("source");
    });
  });

  describe("persona pack selection", () => {
    it("uses governance pack when configured", async () => {
      const executor = createMockExecutor();
      // governance pack has 5 personas, should trigger 5 LLM calls
      const modelCalls: ModelMessage[][] = [];
      const model: ModelAdapter = async (msgs) => {
        modelCalls.push(msgs);
        return "VOTE: YES\nCONFIDENCE: 0.8\nRATIONALE: ok";
      };

      const safe = consensus.wrap(executor, {
        model,
        pack: "governance",
        logger: false,
      });
      await safe("send_email", { to: "test@test.com" });

      expect(modelCalls.length).toBe(5); // governance pack has 5 personas
    });
  });

  describe("custom risk tiers", () => {
    it("respects user-defined risk tier overrides", async () => {
      const modelCalls: ModelMessage[][] = [];
      const model: ModelAdapter = async (msgs) => {
        modelCalls.push(msgs);
        return "VOTE: YES\nCONFIDENCE: 0.9\nRATIONALE: ok";
      };

      const executor = createMockExecutor();
      const safe = consensus.wrap(executor, {
        model,
        riskTiers: { get_weather: "high" }, // Override: treat read-only as high-risk
        logger: false,
      });
      await safe("get_weather", { city: "SF" });

      // Should have triggered LLM calls because we overrode to high-risk
      expect(modelCalls.length).toBe(3);
    });
  });
});

describe("consensus.wrap with LLM - policy support", () => {
  it("accepts core policy names", async () => {
    const executor = createMockExecutor();
    const safe = consensus.wrap(executor, {
      model: createAllowModel(),
      policy: "WEIGHTED_REPUTATION",
      logger: false,
    });
    const result = await safe("send_email", { to: "test@test.com" });
    expect(result).toBeDefined();
  });

  it("accepts friendly policy names", async () => {
    const executor = createMockExecutor();
    const safe = consensus.wrap(executor, {
      model: createAllowModel(),
      policy: "weighted_reputation",
      logger: false,
    });
    const result = await safe("send_email", { to: "test@test.com" });
    expect(result).toBeDefined();
  });
});

describe("policy-aware action determination", () => {
  it("supermajority: blocks when only simple majority approves (2/3 YES)", async () => {
    let callIndex = 0;
    const model: ModelAdapter = async () => {
      callIndex++;
      if (callIndex <= 2) {
        return "VOTE: YES\nCONFIDENCE: 0.8\nRATIONALE: ok";
      }
      return "VOTE: NO\nCONFIDENCE: 0.8\nRATIONALE: not safe";
    };

    const executor = createMockExecutor();
    const safe = consensus.wrap(executor, {
      model,
      policy: "supermajority",
      failPolicy: "closed",
      logger: false,
    });

    // 2/3 = 66.7% which is below 67% supermajority threshold
    // Raw vote counting would allow (2 > 1). Policy-aware should block.
    await expect(
      safe("send_email", { to: "test@test.com" }),
    ).rejects.toThrow(ConsensusBlockedError);
    expect(executor).not.toHaveBeenCalled();
  });

  it("unanimous: blocks when any persona votes NO", async () => {
    let callIndex = 0;
    const model: ModelAdapter = async () => {
      callIndex++;
      if (callIndex <= 2) {
        return "VOTE: YES\nCONFIDENCE: 0.9\nRATIONALE: fine";
      }
      return "VOTE: NO\nCONFIDENCE: 0.9\nRATIONALE: no way";
    };

    const executor = createMockExecutor();
    const safe = consensus.wrap(executor, {
      model,
      policy: "unanimous",
      failPolicy: "closed",
      logger: false,
    });

    // 2/3 YES. Unanimous requires all. Raw counting would allow. Policy-aware blocks.
    await expect(
      safe("send_email", { to: "test@test.com" }),
    ).rejects.toThrow(ConsensusBlockedError);
    expect(executor).not.toHaveBeenCalled();
  });

  it("rewrite majority triggers escalate regardless of policy", async () => {
    const model: ModelAdapter = async () => {
      return "VOTE: REWRITE\nCONFIDENCE: 0.8\nRATIONALE: needs changes";
    };

    const onDecision = vi.fn();
    const executor = createMockExecutor();
    const safe = consensus.wrap(executor, {
      model,
      policy: "majority",
      failPolicy: "closed",
      onDecision,
      logger: false,
    });

    await expect(
      safe("send_email", { to: "test@test.com" }),
    ).rejects.toThrow(ConsensusBlockedError);

    const decision = onDecision.mock.calls[0]![0] as LlmDecisionResult;
    expect(decision.action).toBe("escalate");
  });

  it("majority: allows when more YES than NO (2/3)", async () => {
    let callIndex = 0;
    const model: ModelAdapter = async () => {
      callIndex++;
      if (callIndex <= 2) {
        return "VOTE: YES\nCONFIDENCE: 0.8\nRATIONALE: ok";
      }
      return "VOTE: NO\nCONFIDENCE: 0.8\nRATIONALE: not safe";
    };

    const onDecision = vi.fn();
    const executor = createMockExecutor();
    const safe = consensus.wrap(executor, {
      model,
      policy: "majority",
      onDecision,
      logger: false,
    });

    const result = await safe("send_email", { to: "test@test.com" });
    expect(result).toBeDefined();
    expect(executor).toHaveBeenCalled();

    const decision = onDecision.mock.calls[0]![0] as LlmDecisionResult;
    expect(decision.action).toBe("allow");
  });

  it("threshold:0.8: blocks when below 80% approval", async () => {
    let callIndex = 0;
    const model: ModelAdapter = async () => {
      callIndex++;
      if (callIndex <= 2) {
        return "VOTE: YES\nCONFIDENCE: 0.8\nRATIONALE: ok";
      }
      return "VOTE: NO\nCONFIDENCE: 0.8\nRATIONALE: not safe";
    };

    const executor = createMockExecutor();
    const safe = consensus.wrap(executor, {
      model,
      policy: "threshold:0.8",
      failPolicy: "closed",
      logger: false,
    });

    // 2/3 YES = 67% < 80% threshold → block
    await expect(
      safe("send_email", { to: "test@test.com" }),
    ).rejects.toThrow(ConsensusBlockedError);
    expect(executor).not.toHaveBeenCalled();
  });
});
