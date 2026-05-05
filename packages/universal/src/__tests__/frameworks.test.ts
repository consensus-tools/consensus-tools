import { describe, it, expect, vi } from "vitest";
import { MissingDependencyError } from "../errors.js";

// Mock the optional adapter packages to simulate them not being installed
vi.mock("@consensus-tools/langchain", () => {
  throw new Error("Cannot find module '@consensus-tools/langchain'");
});

vi.mock("@consensus-tools/ai-sdk", () => {
  throw new Error("Cannot find module '@consensus-tools/ai-sdk'");
});

vi.mock("@consensus-tools/mcp", () => {
  throw new Error("Cannot find module '@consensus-tools/mcp'");
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
      throw new Error("Cannot find module '@consensus-tools/langchain'");
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
      throw new Error("Cannot find module '@consensus-tools/langchain'");
    });
  });
});
