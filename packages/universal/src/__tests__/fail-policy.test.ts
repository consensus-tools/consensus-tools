import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { consensus } from "../index.js";
import { ConsensusBlockedError } from "../errors.js";
import type { ModelAdapter, ModelMessage } from "../types.js";

// Model that throws to simulate deliberation failure
function createCrashingModel(): ModelAdapter {
  return async (_messages: ModelMessage[]) => {
    throw new Error("LLM unavailable");
  };
}

describe("failPolicy behavior", () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env["NODE_ENV"];
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env["NODE_ENV"];
    } else {
      process.env["NODE_ENV"] = originalNodeEnv;
    }
  });

  it("failPolicy:'closed' + LLM crashes mid-deliberation → executor NOT called, deliberation completes via regex fallback", async () => {
    // The deliberation pipeline tolerates per-persona LLM crashes by falling back
    // to regex evaluation, so the call still produces a decision rather than throwing.
    // The fail-safe in fallback is NO with low confidence, which blocks under closed.
    const fn = vi.fn(async () => "result");

    const wrapped = consensus.wrap(fn, {
      model: createCrashingModel(),
      failPolicy: "closed",
      logger: false,
    });

    await expect(wrapped("myTool", {})).rejects.toThrow(ConsensusBlockedError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("failPolicy:'open' + LLM crashes → fn executes once and result returns", async () => {
    const fn = vi.fn(async () => "fallback-result");

    const wrapped = consensus.wrap(fn, {
      model: createCrashingModel(),
      failPolicy: "open",
      logger: false,
    });

    const result = await wrapped("myTool", { key: "val" });
    expect(result).toBe("fallback-result");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("NODE_ENV=production + failPolicy:'open' → console.warn emitted at wrap time", () => {
    process.env["NODE_ENV"] = "production";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fn = vi.fn(async () => "result");
    consensus.wrap(fn, { failPolicy: "open" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("failPolicy 'open' in production"),
    );
    warnSpy.mockRestore();
  });

  it("NODE_ENV=production + storage:'memory' → console.warn emitted", () => {
    process.env["NODE_ENV"] = "production";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fn = vi.fn(async () => "result");
    consensus.wrap(fn, { storage: "memory" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("storage 'memory' in production"),
    );
    warnSpy.mockRestore();
  });

  it("NODE_ENV=development → no warnings emitted", () => {
    process.env["NODE_ENV"] = "development";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fn = vi.fn(async () => "result");
    consensus.wrap(fn, { failPolicy: "open", storage: "memory" });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
