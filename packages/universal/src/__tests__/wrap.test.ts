import { describe, it, expect, vi, beforeEach } from "vitest";
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
}));

// Import after mocks are set up
const { consensus } = await import("../index.js");

describe("consensus.wrap()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: wrap function, reviewers run, decision returned", async () => {
    const fn = vi.fn(async (_name: string, _args: Record<string, unknown>) => "tool-result");

    mockWrapped.mockResolvedValueOnce({
      action: "allow",
      output: "tool-result",
      scores: [{ score: 0.9, rationale: "approved" }],
      aggregateScore: 0.9,
      attempt: 1,
    });

    const wrapped = consensus.wrap(fn);
    const result = await wrapped("myTool", { input: "data" });

    expect(result).toBe("tool-result");
    expect(mockWrapped).toHaveBeenCalledWith("myTool", { input: "data" });
  });

  it("wrapped fn returns undefined -> reviewers evaluate undefined", async () => {
    const fn = vi.fn(async () => undefined);

    mockWrapped.mockResolvedValueOnce({
      action: "allow",
      output: undefined,
      scores: [{ score: 0.8 }],
      aggregateScore: 0.8,
      attempt: 1,
    });

    const wrapped = consensus.wrap(fn);
    const result = await wrapped("myTool", {});

    expect(result).toBeUndefined();
  });

  it("wrapped fn throws synchronously -> failPolicy 'closed' throws ConsensusBlockedError", async () => {
    const fn = vi.fn(() => {
      throw new Error("sync explosion");
    });

    mockWrapped.mockRejectedValueOnce(new Error("sync explosion"));

    const wrapped = consensus.wrap(fn, { failPolicy: "closed" });
    await expect(wrapped("myTool", {})).rejects.toThrow(ConsensusBlockedError);
  });

  it("all reviewers return score=0 -> unanimous block with failPolicy closed", async () => {
    const fn = vi.fn(async () => "result");

    mockWrapped.mockResolvedValueOnce({
      action: "block",
      output: null,
      scores: [
        { score: 0, rationale: "blocked-1" },
        { score: 0, rationale: "blocked-2" },
        { score: 0, rationale: "blocked-3" },
      ],
      aggregateScore: 0,
      attempt: 1,
    });

    const wrapped = consensus.wrap(fn, { failPolicy: "closed" });
    await expect(wrapped("dangerousTool", {})).rejects.toThrow(ConsensusBlockedError);

    // Second call to verify message content
    mockWrapped.mockResolvedValueOnce({
      action: "block",
      output: null,
      scores: [
        { score: 0, rationale: "blocked-1" },
        { score: 0, rationale: "blocked-2" },
        { score: 0, rationale: "blocked-3" },
      ],
      aggregateScore: 0,
      attempt: 1,
    });
    await expect(wrapped("dangerousTool", {})).rejects.toThrow(/Consensus block/);
  });
});
