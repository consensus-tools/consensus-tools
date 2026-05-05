import { describe, it, expect, vi } from "vitest";
import { consensus } from "../index.js";
import { ConsensusBlockedError, ConfigError } from "../errors.js";
import type { ModelAdapter, ModelMessage } from "../types.js";

// ── Mock model adapters for deterministic vote control ──────────────

function createAllowModel(): ModelAdapter {
  return async (_messages: ModelMessage[]) =>
    "VOTE: YES\nCONFIDENCE: 0.9\nRATIONALE: Looks safe.";
}

function createBlockModel(): ModelAdapter {
  return async (_messages: ModelMessage[]) =>
    "VOTE: NO\nCONFIDENCE: 0.95\nRATIONALE: Dangerous.";
}

describe("consensus.wrap()", () => {
  it("happy path: executor runs after allow decision, returns its output", async () => {
    const fn = vi.fn(async (_name: string, _args: Record<string, unknown>) => "tool-result");

    const wrapped = consensus.wrap(fn, {
      model: createAllowModel(),
      logger: false,
    });
    const result = await wrapped("myTool", { input: "data" });

    expect(result).toBe("tool-result");
    expect(fn).toHaveBeenCalledWith("myTool", { input: "data" });
  });

  it("block + failPolicy:'closed' → throws ConsensusBlockedError, executor NOT called", async () => {
    const fn = vi.fn(async () => "should-not-run");

    const wrapped = consensus.wrap(fn, {
      model: createBlockModel(),
      failPolicy: "closed",
      logger: false,
    });

    await expect(wrapped("dangerousTool", {})).rejects.toThrow(ConsensusBlockedError);
    // The key behavioral guarantee of the unified pre-execution pipeline:
    // a blocked call MUST NOT execute the wrapped function.
    expect(fn).not.toHaveBeenCalled();
  });

  it("block + failPolicy:'open' → executes fn EXACTLY once (no double-exec)", async () => {
    const fn = vi.fn(async () => "fallback-result");

    const wrapped = consensus.wrap(fn, {
      model: createBlockModel(),
      failPolicy: "open",
      logger: false,
    });

    const result = await wrapped("riskyTool", {});
    expect(result).toBe("fallback-result");
    // Regression guard: pre-unification this would have executed twice in regex mode.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("regex mode (no model) wraps and allows benign calls under default guards", async () => {
    const fn = vi.fn(async () => ({ ok: true }));
    const wrapped = consensus.wrap(fn, { logger: false });

    const result = await wrapped("get_weather", { city: "SF" });

    // Default guards are deterministic; benign args should allow.
    expect(result).toEqual({ ok: true });
    expect(fn).toHaveBeenCalledOnce();
  });

  it("regex mode default config BLOCKS dangerous calls (regression: must not rubber-stamp)", async () => {
    // Critical regression guard: a no-config consensus.wrap() must NOT execute
    // calls that contain destructive shell, secrets, or PII patterns.
    // The default guard set must do real work — not silently fail-safe-YES.
    const fn = vi.fn(async () => ({ ran: true }));
    const wrapped = consensus.wrap(fn, { logger: false, failPolicy: "closed" });

    await expect(
      wrapped("exec_shell", { cmd: "rm -rf /", secret: "hunter2" }),
    ).rejects.toThrow(ConsensusBlockedError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("returns an executor that exposes .feedback() in both modes", () => {
    const fn = vi.fn(async () => "x");
    const regexWrapped = consensus.wrap(fn);
    const llmWrapped = consensus.wrap(fn, { model: createAllowModel(), logger: false });

    expect(typeof regexWrapped.feedback).toBe("function");
    expect(typeof llmWrapped.feedback).toBe("function");
  });

  it("throws ConfigError when guards is empty in regex mode", () => {
    const fn = vi.fn(async () => "x");
    expect(() => consensus.wrap(fn, { guards: [] })).toThrow(ConfigError);
  });

  it("warns when personas is provided without a model (regex mode ignores them)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fn = vi.fn(async () => "x");
    consensus.wrap(fn, {
      personas: [{ id: "p1", name: "Persona", role: "security" }],
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("personas` is only used when a `model`"),
    );
    warnSpy.mockRestore();
  });

  it("shadow mode runs fn even when deliberation crashes", async () => {
    // Shadow contract: never block, never throw, regardless of failPolicy or errors.
    const fn = vi.fn(async () => "result");
    const crashingModel: ModelAdapter = async () => {
      throw new Error("LLM unavailable");
    };
    const wrapped = consensus.wrap(fn, {
      model: crashingModel,
      mode: "shadow",
      failPolicy: "closed",
      logger: false,
    });

    const result = await wrapped("anyTool", {});
    expect(result).toBe("result");
    expect(fn).toHaveBeenCalledOnce();
  });
});
