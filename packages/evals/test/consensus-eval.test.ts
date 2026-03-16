import { describe, it, expect } from "vitest";
import { weightedComposite, parseABResponse } from "../src/consensus-eval.js";
import type { JudgeScore, AgentEvalScore } from "../src/types.js";
import type { AgentPersona } from "../src/personas.js";

function makeScores(c: number, co: number, a: number): JudgeScore {
  return { clarity: c, completeness: co, actionability: a, reasoning: "" };
}

function makeAgent(id: string, rep: number): AgentPersona & { reputation: number } {
  return { id, name: `Agent ${id}`, role: "test", systemPrompt: "", evaluationFocus: "", reputation: rep };
}

describe("weightedComposite", () => {
  it("weights by reputation — higher rep agent has more influence", () => {
    const result = weightedComposite([
      { scores: makeScores(5, 5, 5), reputation: 120 },
      { scores: makeScores(3, 3, 3), reputation: 80 },
    ]);
    // Weight: 1.2 + 0.8 = 2.0
    // Clarity: (5*1.2 + 3*0.8) / 2.0 = (6+2.4)/2 = 4.2
    expect(result.clarity).toBeCloseTo(4.2, 1);
    expect(result.completeness).toBeCloseTo(4.2, 1);
    expect(result.actionability).toBeCloseTo(4.2, 1);
  });

  it("equal reputations = simple average", () => {
    const result = weightedComposite([
      { scores: makeScores(5, 4, 3), reputation: 100 },
      { scores: makeScores(3, 4, 5), reputation: 100 },
    ]);
    expect(result.clarity).toBe(4);
    expect(result.completeness).toBe(4);
    expect(result.actionability).toBe(4);
  });

  it("returns zeros on empty input", () => {
    const result = weightedComposite([]);
    expect(result.clarity).toBe(0);
    expect(result.completeness).toBe(0);
  });
});

describe("parseABResponse", () => {
  const agent = makeAgent("a1", 100);

  it("parses valid JSON response", () => {
    const text = '{"a_scores":{"clarity":4,"completeness":3,"actionability":4},"b_scores":{"clarity":5,"completeness":5,"actionability":5},"winner":"B","reasoning":"B is better"}';
    const result = parseABResponse(text, agent);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe("B");
    expect(result!.aScores.clarity).toBe(4);
    expect(result!.bScores.clarity).toBe(5);
    expect(result!.reasoning).toBe("B is better");
  });

  it("returns null on non-JSON", () => {
    expect(parseABResponse("no json here", agent)).toBeNull();
  });

  it("handles missing fields with defaults", () => {
    const text = '{"winner":"A"}';
    const result = parseABResponse(text, agent);
    expect(result).not.toBeNull();
    expect(result!.aScores.clarity).toBe(2); // default
    expect(result!.winner).toBe("A");
  });

  it("normalizes winner to uppercase", () => {
    const text = '{"a_scores":{},"b_scores":{},"winner":"b"}';
    const result = parseABResponse(text, agent);
    expect(result!.winner).toBe("B");
  });

  it("treats invalid winner as TIE", () => {
    const text = '{"a_scores":{},"b_scores":{},"winner":"neither"}';
    const result = parseABResponse(text, agent);
    expect(result!.winner).toBe("TIE");
  });

  it("validates scores (non-numeric → 2)", () => {
    const text = '{"a_scores":{"clarity":"bad"},"b_scores":{"clarity":4},"winner":"B"}';
    const result = parseABResponse(text, agent);
    expect(result!.aScores.clarity).toBe(2);
    expect(result!.bScores.clarity).toBe(4);
  });
});

describe("winner determination logic", () => {
  // Test the math that consensusEval uses internally
  function determineWinner(results: { winner: string; reputation: number }[]): { winner: string; agreement: number } {
    let wA = 0, wB = 0;
    for (const r of results) {
      const ew = r.reputation / 100;
      if (r.winner === "A") wA += ew;
      else if (r.winner === "B") wB += ew;
    }
    const total = wA + wB;
    if (total === 0) return { winner: "TIE", agreement: 1.0 };
    if (wA > wB) return { winner: "A", agreement: wA / total };
    if (wB > wA) return { winner: "B", agreement: wB / total };
    return { winner: "TIE", agreement: 0.5 };
  }

  it("3-2 split — majority wins", () => {
    const { winner, agreement } = determineWinner([
      { winner: "B", reputation: 100 },
      { winner: "B", reputation: 100 },
      { winner: "B", reputation: 100 },
      { winner: "A", reputation: 100 },
      { winner: "A", reputation: 100 },
    ]);
    expect(winner).toBe("B");
    expect(agreement).toBeCloseTo(0.6, 1);
  });

  it("unanimous", () => {
    const { winner, agreement } = determineWinner([
      { winner: "B", reputation: 100 },
      { winner: "B", reputation: 100 },
      { winner: "B", reputation: 100 },
    ]);
    expect(winner).toBe("B");
    expect(agreement).toBe(1.0);
  });

  it("2-2 with 1 abstain — higher rep side wins", () => {
    const { winner } = determineWinner([
      { winner: "B", reputation: 120 },
      { winner: "B", reputation: 120 },
      { winner: "A", reputation: 80 },
      { winner: "A", reputation: 80 },
      { winner: "TIE", reputation: 100 },
    ]);
    expect(winner).toBe("B");
  });

  it("all TIE votes = TIE", () => {
    const { winner } = determineWinner([
      { winner: "TIE", reputation: 100 },
      { winner: "TIE", reputation: 100 },
    ]);
    expect(winner).toBe("TIE");
  });

  it("exact tie in rep-weight = TIE", () => {
    const { winner, agreement } = determineWinner([
      { winner: "A", reputation: 100 },
      { winner: "B", reputation: 100 },
    ]);
    expect(winner).toBe("TIE");
    expect(agreement).toBe(0.5);
  });
});
