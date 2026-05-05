import { describe, it, expect, vi } from "vitest";
import { MissingDependencyError, AdapterLoadError, AdapterExportError } from "../errors.js";

// Module-not-found errors from Node carry a `code`. Mock that shape so
// loadAdapter() routes correctly.
function moduleNotFound(name: string): Error {
  const err = new Error(`Cannot find package '${name}'`) as NodeJS.ErrnoException;
  err.code = "ERR_MODULE_NOT_FOUND";
  return err;
}

vi.mock("@consensus-tools/langchain", () => {
  throw moduleNotFound("@consensus-tools/langchain");
});

vi.mock("@consensus-tools/ai-sdk", () => {
  throw moduleNotFound("@consensus-tools/ai-sdk");
});

vi.mock("@consensus-tools/mcp", () => {
  throw moduleNotFound("@consensus-tools/mcp");
});

const { consensus } = await import("../index.js");

describe("framework shortcuts", () => {
  it("consensus.langchain() throws MissingDependencyError when adapter not installed", async () => {
    await expect(consensus.langchain({} as any)).rejects.toThrow(MissingDependencyError);
    await expect(consensus.langchain({} as any)).rejects.toThrow("@consensus-tools/langchain");
  });

  it("consensus.aiSdk() throws MissingDependencyError when adapter not installed", async () => {
    await expect(consensus.aiSdk(() => {})).rejects.toThrow(MissingDependencyError);
    await expect(consensus.aiSdk(() => {})).rejects.toThrow("@consensus-tools/ai-sdk");
  });

  it("consensus.mcp() throws MissingDependencyError when adapter not installed", async () => {
    await expect(consensus.mcp()).rejects.toThrow(MissingDependencyError);
    await expect(consensus.mcp()).rejects.toThrow("@consensus-tools/mcp");
  });

  // Note: tests that assert `err.cause` identity against the original
  // thrown error don't work through vitest's mock factory — vitest wraps
  // factory throws in its own error and drops the original `code`. Real
  // Node propagates the cause unmodified. Trust loadAdapter's `{ cause }`
  // forwarding via the type signature instead.
});

describe("adapter load failures (installed but broken)", () => {
  it("throws AdapterLoadError when adapter throws a non-module-not-found error", async () => {
    vi.doMock("@consensus-tools/langchain", () => {
      throw new SyntaxError("Unexpected token in module");
    });

    const { consensus: freshConsensus } = await import("../index.js");

    await expect(freshConsensus.langchain(null)).rejects.toThrow(AdapterLoadError);
    await expect(freshConsensus.langchain(null)).rejects.toThrow("failed to load");

    vi.doMock("@consensus-tools/langchain", () => {
      throw moduleNotFound("@consensus-tools/langchain");
    });
  });

  it("routes a non-module-not-found ai-sdk failure to AdapterLoadError", async () => {
    vi.doMock("@consensus-tools/ai-sdk", () => {
      throw new TypeError("Cannot read properties of undefined");
    });

    const { consensus: freshConsensus } = await import("../index.js");
    await expect(freshConsensus.aiSdk(() => {})).rejects.toThrow(AdapterLoadError);

    vi.doMock("@consensus-tools/ai-sdk", () => {
      throw moduleNotFound("@consensus-tools/ai-sdk");
    });
  });
});

describe("adapter export failures (loaded but missing export)", () => {
  it("throws AdapterExportError when langchain adapter is missing the expected export", async () => {
    vi.doMock("@consensus-tools/langchain", () => ({ SomeOtherExport: class {} }));

    const { consensus: freshConsensus } = await import("../index.js");

    await expect(freshConsensus.langchain(null)).rejects.toThrow(AdapterExportError);
    await expect(freshConsensus.langchain(null)).rejects.toThrow("ConsensusGuardCallbackHandler");

    vi.doMock("@consensus-tools/langchain", () => {
      throw moduleNotFound("@consensus-tools/langchain");
    });
  });

  it("throws AdapterExportError when ai-sdk adapter is missing createGuardedGenerate", async () => {
    vi.doMock("@consensus-tools/ai-sdk", () => ({ unrelated: 1 }));

    const { consensus: freshConsensus } = await import("../index.js");

    await expect(freshConsensus.aiSdk(() => {})).rejects.toThrow(AdapterExportError);

    vi.doMock("@consensus-tools/ai-sdk", () => {
      throw moduleNotFound("@consensus-tools/ai-sdk");
    });
  });
});

describe("CJS-default-wrapped exports", () => {
  it("finds the export under .default when a CJS package is loaded", async () => {
    class MockGuardHandler {
      config: Record<string, unknown>;
      constructor(config: Record<string, unknown>) {
        this.config = config;
      }
    }

    // Simulate a CJS package whose named export only appears under `.default`.
    vi.doMock("@consensus-tools/langchain", () => ({
      default: { ConsensusGuardCallbackHandler: MockGuardHandler },
    }));

    const { consensus: freshConsensus } = await import("../index.js");

    const handler = await freshConsensus.langchain(null, { policy: "majority", guards: ["security"] });
    expect(handler).toBeInstanceOf(MockGuardHandler);

    vi.doMock("@consensus-tools/langchain", () => {
      throw moduleNotFound("@consensus-tools/langchain");
    });
  });
});

describe("consensus.langchain() with adapter installed", () => {
  it("returns a handler instance when adapter is available", async () => {
    // Create a mock handler class
    class MockGuardHandler {
      name = "consensus-guard";
      config: Record<string, unknown>;
      constructor(config: Record<string, unknown>) {
        this.config = config;
      }
    }

    // Temporarily override the langchain mock to return a working module
    const mockMod = {
      ConsensusGuardCallbackHandler: MockGuardHandler,
    };

    // We need to test with a fresh import; use vi.doMock to override for a scoped import
    vi.doMock("@consensus-tools/langchain", () => mockMod);

    // Re-import to pick up the new mock
    const { consensus: freshConsensus } = await import("../index.js");

    const handler = await freshConsensus.langchain(null, { policy: "supermajority", guards: ["security"] });

    expect(handler).toBeInstanceOf(MockGuardHandler);
    expect((handler as MockGuardHandler).config).toEqual({
      policy: "supermajority",
      guards: ["security"],
      onDecision: undefined,
    });

    // Restore the original mock (not installed)
    vi.doMock("@consensus-tools/langchain", () => {
      throw moduleNotFound("@consensus-tools/langchain");
    });
  });

  it("uses default policy 'majority' when no config provided", async () => {
    class MockGuardHandler {
      name = "consensus-guard";
      config: Record<string, unknown>;
      constructor(config: Record<string, unknown>) {
        this.config = config;
      }
    }

    vi.doMock("@consensus-tools/langchain", () => ({
      ConsensusGuardCallbackHandler: MockGuardHandler,
    }));

    const { consensus: freshConsensus } = await import("../index.js");
    const handler = await freshConsensus.langchain(null);

    expect((handler as MockGuardHandler).config.policy).toBe("majority");

    vi.doMock("@consensus-tools/langchain", () => {
      throw moduleNotFound("@consensus-tools/langchain");
    });
  });
});
