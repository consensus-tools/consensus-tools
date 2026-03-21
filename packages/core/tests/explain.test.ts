import { describe, it, expect, vi } from "vitest";
import {
  explainDecision,
  normalizeGuardVote,
  normalizeReviewResult,
  guardResultToExplainInput,
} from "../src/explain.js";
import type { ExplainInput, GuardVote, GuardResult } from "@consensus-tools/schemas";

// ── normalizeGuardVote ──────────────────────────────────────────

describe("normalizeGuardVote", () => {
  it("normalizes a YES vote", () => {
    const vote: GuardVote = { evaluator: "safety-reviewer", vote: "YES", reason: "Looks safe", risk: 0.2 };
    const result = normalizeGuardVote(vote);
    expect(result.evaluator).toBe("safety-reviewer");
    expect(result.score).toBe(0.8); // 1 - risk for YES
    expect(result.rationale).toBe("Looks safe");
    expect(result.vote).toBe("YES");
  });

  it("normalizes a NO vote", () => {
    const vote: GuardVote = { evaluator: "security-gatekeeper", vote: "NO", reason: "Too risky", risk: 0.9 };
    const result = normalizeGuardVote(vote);
    expect(result.evaluator).toBe("security-gatekeeper");
    expect(result.score).toBe(0.9); // risk value for NO
    expect(result.vote).toBe("NO");
  });

  it("normalizes a REWRITE vote to 0.5 score", () => {
    const vote: GuardVote = { evaluator: "editor", vote: "REWRITE", reason: "Needs changes", risk: 0.4 };
    const result = normalizeGuardVote(vote);
    expect(result.score).toBe(0.5);
    expect(result.vote).toBe("REWRITE");
  });
});

// ── normalizeReviewResult ───────────────────────────────────────

describe("normalizeReviewResult", () => {
  it("normalizes a ReviewResult with rationale", () => {
    const result = normalizeReviewResult({ score: 0.85, rationale: "Good output" }, 0);
    expect(result.evaluator).toBe("reviewer-1");
    expect(result.score).toBe(0.85);
    expect(result.rationale).toBe("Good output");
  });

  it("handles missing rationale", () => {
    const result = normalizeReviewResult({ score: 0.3 }, 2);
    expect(result.evaluator).toBe("reviewer-3");
    expect(result.rationale).toBe("(no rationale provided)");
  });
});

// ── guardResultToExplainInput ───────────────────────────────────

describe("guardResultToExplainInput", () => {
  it("converts a GuardResult to ExplainInput", () => {
    const guardResult: GuardResult = {
      decision: "BLOCK",
      reason: "High risk",
      risk_score: 0.85,
      audit_id: "test-audit-123",
      votes: [
        { evaluator: "safety", vote: "NO", reason: "Dangerous", risk: 0.9 },
        { evaluator: "compliance", vote: "YES", reason: "Compliant", risk: 0.2 },
      ],
      guard_type: "send_email",
    };

    const input = guardResultToExplainInput(guardResult);
    expect(input.auditId).toBe("test-audit-123");
    expect(input.decision).toBe("BLOCK");
    expect(input.riskScore).toBe(0.85);
    expect(input.guardType).toBe("send_email");
    expect(input.votes).toHaveLength(2);
    expect(input.votes![0].evaluator).toBe("safety");
    expect(input.votes![1].evaluator).toBe("compliance");
  });

  it("handles GuardResult with no votes", () => {
    const guardResult: GuardResult = {
      decision: "ALLOW",
      reason: "Low risk",
      risk_score: 0.1,
      audit_id: "test-audit-456",
    };

    const input = guardResultToExplainInput(guardResult);
    expect(input.votes).toEqual([]);
  });
});

// ── explainDecision ─────────────────────────────────────────────

describe("explainDecision", () => {
  const mockLlm = vi.fn<(prompt: string) => Promise<string>>();

  const sampleInput: ExplainInput = {
    auditId: "audit-abc",
    decision: "BLOCK",
    riskScore: 0.85,
    guardType: "send_email",
    votes: [
      { evaluator: "safety-reviewer", score: 0.9, rationale: "Recipient not verified", vote: "NO" },
      { evaluator: "compliance-checker", score: 0.7, rationale: "Missing opt-out link", vote: "NO" },
      { evaluator: "content-reviewer", score: 0.3, rationale: "Content looks fine", vote: "YES" },
    ],
    policy: { quorum: 0.7, riskThreshold: 0.7 },
  };

  it("returns ok with narrative on successful LLM call", async () => {
    mockLlm.mockResolvedValueOnce("The email was blocked because 2 of 3 reviewers flagged it as high-risk.");

    const result = await explainDecision(sampleInput, { llm: mockLlm });
    expect(result.status).toBe("ok");
    expect(result.narrative).toBe("The email was blocked because 2 of 3 reviewers flagged it as high-risk.");
    expect(result.auditId).toBe("audit-abc");
  });

  it("returns error when LLM throws", async () => {
    mockLlm.mockRejectedValueOnce(new Error("API timeout"));

    const result = await explainDecision(sampleInput, { llm: mockLlm });
    expect(result.status).toBe("error");
    expect(result.error).toContain("LLM call failed");
    expect(result.error).toContain("API timeout");
    expect(result.auditId).toBe("audit-abc");
  });

  it("returns error when LLM returns empty string", async () => {
    mockLlm.mockResolvedValueOnce("");

    const result = await explainDecision(sampleInput, { llm: mockLlm });
    expect(result.status).toBe("error");
    expect(result.error).toBe("LLM returned empty response");
  });

  it("returns error when LLM returns whitespace-only", async () => {
    mockLlm.mockResolvedValueOnce("   \n  ");

    const result = await explainDecision(sampleInput, { llm: mockLlm });
    expect(result.status).toBe("error");
    expect(result.error).toBe("LLM returned empty response");
  });

  it("returns error when no votes and no decision provided", async () => {
    const result = await explainDecision({ votes: [] }, { llm: mockLlm });
    expect(result.status).toBe("error");
    expect(result.error).toBe("No vote data or decision to explain");
  });

  it("succeeds with decision but no votes", async () => {
    mockLlm.mockResolvedValueOnce("The action was allowed with no recorded votes.");

    const result = await explainDecision(
      { decision: "ALLOW", riskScore: 0.1 },
      { llm: mockLlm },
    );
    expect(result.status).toBe("ok");
  });

  it("calls onPrompt callback with the prompt text", async () => {
    mockLlm.mockResolvedValueOnce("Explanation here.");
    const onPrompt = vi.fn();

    await explainDecision(sampleInput, { llm: mockLlm, onPrompt });
    expect(onPrompt).toHaveBeenCalledOnce();
    const prompt = onPrompt.mock.calls[0][0];
    expect(prompt).toContain("audit trail explainer");
    expect(prompt).toContain("BLOCK");
    expect(prompt).toContain("safety-reviewer");
    expect(prompt).toContain("Recipient not verified");
  });

  it("includes policy context in prompt when provided", async () => {
    mockLlm.mockResolvedValueOnce("Explanation with policy.");
    const onPrompt = vi.fn();

    await explainDecision(sampleInput, { llm: mockLlm, onPrompt });
    const prompt = onPrompt.mock.calls[0][0];
    expect(prompt).toContain("quorum");
    expect(prompt).toContain("0.7");
  });

  it("trims narrative whitespace", async () => {
    mockLlm.mockResolvedValueOnce("\n  The decision was made.  \n\n");

    const result = await explainDecision(sampleInput, { llm: mockLlm });
    expect(result.narrative).toBe("The decision was made.");
  });

  it("handles non-Error throw from LLM", async () => {
    mockLlm.mockRejectedValueOnce("string error");

    const result = await explainDecision(sampleInput, { llm: mockLlm });
    expect(result.status).toBe("error");
    expect(result.error).toContain("string error");
  });
});
