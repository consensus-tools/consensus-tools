import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the optional AI SDK peer deps so the LLM path is exercised without any
// network. vi.mock is hoisted; the dynamic import() inside evaluator.ts resolves
// to these mocks. @ai-sdk/anthropic + ai are devDependencies (test-only).
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn((id: string) => ({ __model: id })),
}));
vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn((id: string) => ({ __model: id })),
}));

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import {
  evaluateWithAiSdk,
  parseAiResponse,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
} from "../src/evaluator.js";
import type { AgentPersona } from "../src/personas.js";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";

const mockGenerateText = vi.mocked(generateText);
const mockAnthropic = vi.mocked(anthropic);
const mockOpenai = vi.mocked(openai);

// Minimal input — evaluateWithAiSdk reads input.action.{type,payload}.
const input = {
  action: { type: "deploy", payload: { service: "api" } },
} as unknown as GuardEvaluateInput;

function makePersonas(ids: string[] = ["a1", "a2", "a3"]): AgentPersona[] {
  return ids.map((id, i) => ({
    id,
    name: `Agent ${i + 1}`,
    role: `r${i + 1}`,
    systemPrompt: "You evaluate things.",
    evaluationFocus: "correctness",
  }));
}

describe("evaluateWithAiSdk", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("no API key configured", () => {
    it("throws an actionable error naming both providers and the escape hatch", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      await expect(evaluateWithAiSdk(input, makePersonas())).rejects.toThrow(
        /ANTHROPIC_API_KEY.*OPENAI_API_KEY.*allowDeterministicFallback/s,
      );
    });

    it("returns deterministic fallback votes when explicitly allowed", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      const votes = await evaluateWithAiSdk(input, makePersonas(), {
        allowDeterministicFallback: true,
      });

      expect(votes).toHaveLength(3);
      // Pin the exact fallback shape so a regression in any field fails here.
      expect(votes[0]).toEqual({
        evaluator: "a1",
        vote: "YES",
        risk: 0.3,
        reason: "Agent 1: Deterministic fallback — no AI model configured",
      });
      expect(votes.every((v) => v.vote === "YES" && v.risk === 0.3)).toBe(true);
      // The LLM path must not run when there is no key.
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("returns an empty array for zero personas (fallback)", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      const votes = await evaluateWithAiSdk(input, [], {
        allowDeterministicFallback: true,
      });
      expect(votes).toEqual([]);
    });
  });

  describe("LLM path (Anthropic, mocked SDK)", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // No ambient keys — the LLM path is reached via config.apiKey only,
      // so behavior never depends on a real key being present in CI.
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("AI_MODEL", "");
      mockGenerateText.mockResolvedValue({
        text: "VOTE: NO | RISK: 0.8 | REASON: too risky",
      } as never);
    });

    it("calls the model once per persona and parses each vote in order", async () => {
      const votes = await evaluateWithAiSdk(input, makePersonas(["a1", "a2", "a3"]), {
        apiKey: "sk-ant-test",
      });

      expect(mockGenerateText).toHaveBeenCalledTimes(3);
      expect(votes).toHaveLength(3);
      expect(votes.map((v) => v.evaluator)).toEqual(["a1", "a2", "a3"]);
      for (const v of votes) {
        expect(v.vote).toBe("NO");
        expect(v.risk).toBe(0.8);
        expect(v.reason).toBe("too risky");
      }
    });

    it("defaults to the Anthropic provider and claude-opus-4-8", async () => {
      await evaluateWithAiSdk(input, makePersonas(["solo"]), { apiKey: "sk-ant-test" });
      expect(mockAnthropic).toHaveBeenCalledWith(DEFAULT_ANTHROPIC_MODEL);
      expect(DEFAULT_ANTHROPIC_MODEL).toBe("claude-opus-4-8");
    });

    it("honors config.model over the default", async () => {
      await evaluateWithAiSdk(input, makePersonas(["solo"]), {
        apiKey: "sk-ant-test",
        model: "claude-haiku-4-5",
      });
      expect(mockAnthropic).toHaveBeenCalledWith("claude-haiku-4-5");
    });

    it("honors the AI_MODEL env var when config.model is unset", async () => {
      vi.stubEnv("AI_MODEL", "claude-sonnet-4-6");
      await evaluateWithAiSdk(input, makePersonas(["solo"]), { apiKey: "sk-ant-test" });
      expect(mockAnthropic).toHaveBeenCalledWith("claude-sonnet-4-6");
    });

    it("selects Anthropic when only ANTHROPIC_API_KEY is in the env", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-from-env");
      await evaluateWithAiSdk(input, makePersonas(["solo"]));
      expect(mockAnthropic).toHaveBeenCalledWith(DEFAULT_ANTHROPIC_MODEL);
    });

    it("builds a prompt carrying the persona identity and the action type", async () => {
      await evaluateWithAiSdk(input, makePersonas(["solo"]), { apiKey: "sk-ant-test" });
      const promptArg = (mockGenerateText.mock.calls[0]![0] as { prompt: string }).prompt;
      expect(promptArg).toContain("Agent 1");
      expect(promptArg).toContain("deploy");
      expect(promptArg).toMatch(/VOTE:.*RISK:.*REASON:/s);
    });

    it("rethrows when the model call fails and fallback is off", async () => {
      mockGenerateText.mockRejectedValueOnce(new Error("model exploded"));
      await expect(
        evaluateWithAiSdk(input, makePersonas(["solo"]), { apiKey: "sk-ant-test" }),
      ).rejects.toThrow(/model exploded/);
    });

    it("falls back deterministically when the model call fails and fallback is allowed", async () => {
      mockGenerateText.mockRejectedValue(new Error("model exploded"));
      const votes = await evaluateWithAiSdk(input, makePersonas(["solo"]), {
        apiKey: "sk-ant-test",
        allowDeterministicFallback: true,
      });
      expect(votes).toHaveLength(1);
      expect(votes[0]).toMatchObject({ evaluator: "solo", vote: "YES", risk: 0.3 });
      expect(votes[0]!.reason).toMatch(/Deterministic fallback/);
    });
  });

  describe("provider selection", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      vi.stubEnv("OPENAI_API_KEY", "");
      vi.stubEnv("AI_MODEL", "");
      mockGenerateText.mockResolvedValue({
        text: "VOTE: YES | RISK: 0.2 | REASON: fine",
      } as never);
    });

    it("routes to the OpenAI SDK + gpt-4o-mini when provider is 'openai'", async () => {
      await evaluateWithAiSdk(input, makePersonas(["solo"]), {
        provider: "openai",
        apiKey: "sk-openai-test",
      });
      expect(mockOpenai).toHaveBeenCalledWith(DEFAULT_OPENAI_MODEL);
      expect(DEFAULT_OPENAI_MODEL).toBe("gpt-4o-mini");
      expect(mockAnthropic).not.toHaveBeenCalled();
    });

    it("auto-selects OpenAI when only OPENAI_API_KEY is set (no provider, no Anthropic key)", async () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-openai-env");
      await evaluateWithAiSdk(input, makePersonas(["solo"]));
      expect(mockOpenai).toHaveBeenCalledWith(DEFAULT_OPENAI_MODEL);
      expect(mockAnthropic).not.toHaveBeenCalled();
    });

    it("treats a bare config.apiKey as the Anthropic key by default", async () => {
      await evaluateWithAiSdk(input, makePersonas(["solo"]), { apiKey: "sk-ambiguous" });
      expect(mockAnthropic).toHaveBeenCalledWith(DEFAULT_ANTHROPIC_MODEL);
      expect(mockOpenai).not.toHaveBeenCalled();
    });

    it("prefers Anthropic when both keys are present", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-env");
      vi.stubEnv("OPENAI_API_KEY", "sk-openai-env");
      await evaluateWithAiSdk(input, makePersonas(["solo"]));
      expect(mockAnthropic).toHaveBeenCalledWith(DEFAULT_ANTHROPIC_MODEL);
      expect(mockOpenai).not.toHaveBeenCalled();
    });
  });
});

// parseAiResponse is pure and reachable without any SDK, so it is unit-tested
// directly. Adversarial review (Claude + Codex) flagged the regex parsing, vote
// default, and risk clamping as the largest mutation-blind gap; these close it.
describe("parseAiResponse", () => {
  const persona: AgentPersona = {
    id: "p1",
    name: "Persona One",
    role: "reviewer",
    systemPrompt: "",
    evaluationFocus: "",
  };

  it("parses a well-formed YES response into all fields", () => {
    const v = parseAiResponse(
      "VOTE: YES | RISK: 0.2 | REASON: looks safe to proceed",
      persona,
    );
    expect(v).toEqual({
      evaluator: "p1",
      vote: "YES",
      risk: 0.2,
      reason: "looks safe to proceed",
    });
  });

  it("parses NO and REWRITE votes", () => {
    expect(parseAiResponse("VOTE: NO | RISK: 0.9 | REASON: unsafe", persona).vote).toBe("NO");
    expect(
      parseAiResponse("VOTE: REWRITE | RISK: 0.5 | REASON: needs edits", persona).vote,
    ).toBe("REWRITE");
  });

  it("uppercases a lowercase vote token", () => {
    expect(parseAiResponse("vote: no | risk: 0.4 | reason: x", persona).vote).toBe("NO");
  });

  it("defaults vote to YES when VOTE is missing or unrecognized", () => {
    expect(parseAiResponse("RISK: 0.1 | REASON: no verdict line", persona).vote).toBe("YES");
    expect(parseAiResponse("VOTE: MAYBE | RISK: 0.1 | REASON: x", persona).vote).toBe("YES");
  });

  it("defaults risk to 0.5 when RISK is missing", () => {
    expect(parseAiResponse("VOTE: YES | REASON: no risk line", persona).risk).toBe(0.5);
  });

  it("clamps risk above 1 down to 1", () => {
    expect(parseAiResponse("VOTE: NO | RISK: 5 | REASON: x", persona).risk).toBe(1);
    expect(parseAiResponse("VOTE: NO | RISK: 1.9 | REASON: x", persona).risk).toBe(1);
  });

  it("defaults reason to a persona-named message when REASON is missing", () => {
    const v = parseAiResponse("VOTE: YES | RISK: 0.3", persona);
    expect(v.reason).toBe("Persona One: No issues detected");
  });

  it("trims surrounding whitespace from the reason", () => {
    const v = parseAiResponse("VOTE: YES | RISK: 0.3 | REASON:    padded reason   ", persona);
    expect(v.reason).toBe("padded reason");
  });

  it("always stamps the persona id as evaluator", () => {
    const other = { ...persona, id: "other-id" };
    expect(parseAiResponse("garbage with no fields", other).evaluator).toBe("other-id");
  });

  it("falls back to defaults for completely unparseable text", () => {
    const v = parseAiResponse("this is not in the expected format at all", persona);
    expect(v.vote).toBe("YES");
    expect(v.risk).toBe(0.5);
    expect(v.reason).toBe("Persona One: No issues detected");
  });
});
