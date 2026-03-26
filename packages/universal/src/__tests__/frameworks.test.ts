import { describe, it, expect, vi } from "vitest";
import { MissingDependencyError } from "../errors.js";

// Mock the wrapper and guards (needed for module load)
vi.mock("@consensus-tools/wrapper", () => ({
  consensus: vi.fn(() => vi.fn()),
}));

vi.mock("@consensus-tools/guards", () => ({
  createGuardTemplate: vi.fn((_name: string, _config: unknown) => ({
    asReviewer: () => vi.fn(),
  })),
}));

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
