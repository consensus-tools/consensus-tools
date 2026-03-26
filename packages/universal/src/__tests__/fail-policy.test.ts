import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DecisionResult } from "@consensus-tools/wrapper";
import { ConsensusBlockedError } from "../errors.js";

// Mock the wrapper's consensus function and guards' createGuardTemplate
const mockWrapped = vi.fn<(...args: unknown[]) => Promise<DecisionResult<unknown>>>();

vi.mock("@consensus-tools/wrapper", () => ({
  consensus: vi.fn(() => mockWrapped),
}));

vi.mock("@consensus-tools/guards", () => ({
  createGuardTemplate: vi.fn((_name: string, _config: unknown) => ({
    asReviewer: () => vi.fn(),
  })),
  GUARD_CONFIGS: {
    security: { description: "Security reviewer", rules: () => [] },
    compliance: { description: "Compliance reviewer", rules: () => [] },
    "user-impact": { description: "User-impact reviewer", rules: () => [] },
  },
  DEFAULT_PERSONA_TRIO: ["security", "compliance", "user-impact"],
}));

const { consensus } = await import("../index.js");

describe("failPolicy behavior", () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalNodeEnv = process.env["NODE_ENV"];
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env["NODE_ENV"];
    } else {
      process.env["NODE_ENV"] = originalNodeEnv;
    }
  });

  it("failPolicy: 'closed' + error -> ConsensusBlockedError thrown", async () => {
    const fn = vi.fn(async () => "result");

    mockWrapped.mockRejectedValueOnce(new Error("deliberation crashed"));

    const wrapped = consensus.wrap(fn, { failPolicy: "closed" });
    await expect(wrapped("myTool", {})).rejects.toThrow(ConsensusBlockedError);

    // Second call: verify message
    mockWrapped.mockRejectedValueOnce(new Error("deliberation crashed again"));
    const wrapped2 = consensus.wrap(fn, { failPolicy: "closed" });
    await expect(wrapped2("myTool", {})).rejects.toThrow("Consensus deliberation failed");
  });

  it("failPolicy: 'open' + error -> fn result returned", async () => {
    const fn = vi.fn(async (_name: string, _args: Record<string, unknown>) => "fallback-result");

    // First call: mockWrapped rejects (deliberation error)
    mockWrapped.mockRejectedValueOnce(new Error("deliberation crashed"));

    const wrapped = consensus.wrap(fn, { failPolicy: "open" });
    const result = await wrapped("myTool", { key: "val" });

    // failPolicy 'open' should call fn directly and return its result
    expect(result).toBe("fallback-result");
    expect(fn).toHaveBeenCalledWith("myTool", { key: "val" });
  });

  it("NODE_ENV=production + failPolicy:'open' -> console.warn emitted", () => {
    process.env["NODE_ENV"] = "production";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fn = vi.fn(async () => "result");
    consensus.wrap(fn, { failPolicy: "open" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("failPolicy 'open' in production"),
    );
    warnSpy.mockRestore();
  });

  it("NODE_ENV=production + storage:'memory' -> console.warn emitted", () => {
    process.env["NODE_ENV"] = "production";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fn = vi.fn(async () => "result");
    // storage defaults to 'memory', so no explicit override needed
    consensus.wrap(fn, { storage: "memory" });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("storage 'memory' in production"),
    );
    warnSpy.mockRestore();
  });

  it("NODE_ENV=development -> no warnings emitted", () => {
    process.env["NODE_ENV"] = "development";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fn = vi.fn(async () => "result");
    consensus.wrap(fn, { failPolicy: "open", storage: "memory" });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
