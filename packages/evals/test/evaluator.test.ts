import { describe, it, expect, afterEach, vi } from "vitest";
import { evaluateWithAiSdk, parseAiResponse } from "../src/evaluator.js";
import type { AgentPersona } from "../src/personas.js";
import type { GuardEvaluateInput } from "@consensus-tools/schemas";

// Minimal input — evaluateWithAiSdk only reads input.action.{type,payload}.
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
    it("throws an actionable error when fallback is not allowed", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      await expect(evaluateWithAiSdk(input, makePersonas())).rejects.toThrow(
        /No API key configured/,
      );
    });

    it("error names both the env var and the fallback escape hatch", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      await expect(evaluateWithAiSdk(input, makePersonas())).rejects.toThrow(
        /OPENAI_API_KEY.*allowDeterministicFallback/s,
      );
    });

    it("returns deterministic fallback votes when explicitly allowed", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      const votes = await evaluateWithAiSdk(input, makePersonas(), {
        allowDeterministicFallback: true,
      });

      expect(votes).toHaveLength(3);
      // Pin the exact fallback shape — vote, risk literal, and full reason —
      // so a regression in any of the three fields fails here.
      expect(votes[0]).toEqual({
        evaluator: "a1",
        vote: "YES",
        risk: 0.3,
        reason: "Agent 1: Deterministic fallback — no AI model configured",
      });
      for (const vote of votes) {
        expect(vote.vote).toBe("YES");
        expect(vote.risk).toBe(0.3);
      }
    });

    it("maps one vote per persona, preserving id and order", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      const personas = makePersonas(["alpha", "beta", "gamma"]);
      const votes = await evaluateWithAiSdk(input, personas, {
        allowDeterministicFallback: true,
      });

      expect(votes.map((v) => v.evaluator)).toEqual(["alpha", "beta", "gamma"]);
      expect(votes[0]!.reason).toContain("Agent 1");
      expect(votes[2]!.reason).toContain("Agent 3");
    });

    it("returns an empty array for zero personas", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      const votes = await evaluateWithAiSdk(input, [], {
        allowDeterministicFallback: true,
      });
      expect(votes).toEqual([]);
    });
  });

  describe("API key present but optional ai SDK peer deps absent", () => {
    // `ai` and `@ai-sdk/openai` are not installed in this package, so the
    // dynamic import inside the LLM path throws — exercising the catch branch
    // deterministically with no network.

    it("rethrows the module-resolution failure (not the no-key error) when fallback is off", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      let caught: unknown;
      try {
        await evaluateWithAiSdk(input, makePersonas(), { apiKey: "sk-test-fake-key" });
      } catch (err) {
        caught = err;
      }
      // Must reject, and specifically because the optional `ai` SDK can't be
      // resolved — not the no-key guard, and not some other generic throw.
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).not.toMatch(/No API key configured/);
      expect((caught as Error).message).toMatch(
        /Cannot find (module|package)|Failed to (load|resolve)|ERR_MODULE_NOT_FOUND|resolve.*['"]ai['"]/i,
      );
    });

    it("falls back to deterministic votes when fallback is allowed", async () => {
      vi.stubEnv("OPENAI_API_KEY", "");
      const votes = await evaluateWithAiSdk(input, makePersonas(), {
        apiKey: "sk-test-fake-key",
        allowDeterministicFallback: true,
      });

      expect(votes).toHaveLength(3);
      expect(votes.every((v) => v.vote === "YES" && v.risk === 0.3)).toBe(true);
      expect(votes[0]!.reason).toMatch(/Deterministic fallback/);
    });

    it("prefers config.apiKey over the env var (no no-key throw)", async () => {
      // Env has no key, but config supplies one — so we must reach the import
      // attempt (and its failure), never the "No API key configured" path.
      vi.stubEnv("OPENAI_API_KEY", "");
      const votes = await evaluateWithAiSdk(input, makePersonas(["solo"]), {
        apiKey: "sk-from-config",
        allowDeterministicFallback: true,
      });
      expect(votes).toHaveLength(1);
      expect(votes[0]!.evaluator).toBe("solo");
    });
  });
});

// parseAiResponse is pure and reachable without the optional `ai` SDK, so it
// is unit-tested directly here. Adversarial review (Claude + Codex) flagged the
// regex parsing, vote default, and risk clamping as the largest mutation-blind
// gap; these cases close it.
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
  });

  it("clamps risk to the [0,1] range (high end via multi-dot parse)", () => {
    // "1.9" parses to 1.9 then clamps to 1 — proves Math.min(1, …) fires.
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
