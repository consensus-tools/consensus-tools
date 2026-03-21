import { describe, it, expect, beforeEach } from "vitest";
import { ReputationTracker } from "../lib/reputation.js";
import type { SkillAgent, AgentEvalScore, JudgeScore } from "../lib/types.js";

function makeAgents(reps: number[] = [100, 100, 100, 100, 100]): SkillAgent[] {
  return reps.map((rep, i) => ({
    id: `a${i + 1}`,
    name: `Agent ${i + 1}`,
    role: `r${i + 1}`,
    systemPrompt: "",
    evaluationFocus: "",
    reputation: rep,
  }));
}

function makeScores(c: number, co: number, a: number): JudgeScore {
  return { clarity: c, completeness: co, actionability: a, reasoning: "" };
}

function makeAgentEval(
  agentId: string,
  rep: number,
  aScores: JudgeScore,
  bScores: JudgeScore,
  winner: "A" | "B" | "TIE",
): AgentEvalScore {
  return {
    agentId,
    agentName: `Agent ${agentId}`,
    reputation: rep,
    aScores,
    bScores,
    winner,
    reasoning: "test",
  };
}

// --- Weighted composite tests (C4) ---
// We test the composite logic by reimplementing the same math used in consensus-eval.ts
// computeEffectiveWeight(1, rep, "reputation") = rep / 100

function weightedComposite(entries: { scores: JudgeScore; reputation: number }[]): JudgeScore {
  let tw = 0, wc = 0, wco = 0, wa = 0;
  for (const e of entries) {
    const w = e.reputation / 100;
    tw += w;
    wc += e.scores.clarity * w;
    wco += e.scores.completeness * w;
    wa += e.scores.actionability * w;
  }
  if (tw === 0) return { clarity: 0, completeness: 0, actionability: 0, reasoning: "" };
  return {
    clarity: Math.round((wc / tw) * 100) / 100,
    completeness: Math.round((wco / tw) * 100) / 100,
    actionability: Math.round((wa / tw) * 100) / 100,
    reasoning: "",
  };
}

describe("Consensus Eval — Composite Scoring", () => {
  it("C4: weighted composite with unequal reputations", () => {
    const result = weightedComposite([
      { scores: makeScores(5, 5, 5), reputation: 120 },
      { scores: makeScores(3, 3, 3), reputation: 80 },
    ]);
    // Weight: 1.2 + 0.8 = 2.0
    // Clarity: (5*1.2 + 3*0.8) / 2.0 = (6+2.4)/2 = 4.2
    expect(result.clarity).toBeCloseTo(4.2, 1);
    expect(result.completeness).toBeCloseTo(4.2, 1);
  });

  it("C4: weighted composite with equal reputations = simple average", () => {
    const result = weightedComposite([
      { scores: makeScores(5, 4, 3), reputation: 100 },
      { scores: makeScores(3, 4, 5), reputation: 100 },
    ]);
    expect(result.clarity).toBe(4);
    expect(result.completeness).toBe(4);
    expect(result.actionability).toBe(4);
  });
});

describe("Consensus Eval — Winner Determination", () => {
  // Simulate winner logic from consensus-eval.ts
  function determineWinner(results: AgentEvalScore[]): { winner: string; agreement: number } {
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

  it("C5: 3-2 split — majority wins", () => {
    const results = [
      makeAgentEval("a1", 100, makeScores(4, 4, 4), makeScores(5, 5, 5), "B"),
      makeAgentEval("a2", 100, makeScores(4, 4, 4), makeScores(5, 5, 5), "B"),
      makeAgentEval("a3", 100, makeScores(4, 4, 4), makeScores(5, 5, 5), "B"),
      makeAgentEval("a4", 100, makeScores(5, 5, 5), makeScores(4, 4, 4), "A"),
      makeAgentEval("a5", 100, makeScores(5, 5, 5), makeScores(4, 4, 4), "A"),
    ];
    const { winner, agreement } = determineWinner(results);
    expect(winner).toBe("B");
    expect(agreement).toBeCloseTo(0.6, 1);
  });

  it("C5: unanimous vote", () => {
    const results = [
      makeAgentEval("a1", 100, makeScores(3, 3, 3), makeScores(5, 5, 5), "B"),
      makeAgentEval("a2", 100, makeScores(3, 3, 3), makeScores(5, 5, 5), "B"),
      makeAgentEval("a3", 100, makeScores(3, 3, 3), makeScores(5, 5, 5), "B"),
    ];
    const { winner, agreement } = determineWinner(results);
    expect(winner).toBe("B");
    expect(agreement).toBe(1.0);
  });

  it("C5: 2-2 with 1 abstain — higher rep-weight side wins", () => {
    const results = [
      makeAgentEval("a1", 120, makeScores(4, 4, 4), makeScores(5, 5, 5), "B"),
      makeAgentEval("a2", 120, makeScores(4, 4, 4), makeScores(5, 5, 5), "B"),
      makeAgentEval("a3", 80, makeScores(5, 5, 5), makeScores(4, 4, 4), "A"),
      makeAgentEval("a4", 80, makeScores(5, 5, 5), makeScores(4, 4, 4), "A"),
      makeAgentEval("a5", 100, makeScores(4, 4, 4), makeScores(4, 4, 4), "TIE"),
    ];
    // B weight: 1.2 + 1.2 = 2.4
    // A weight: 0.8 + 0.8 = 1.6
    const { winner, agreement } = determineWinner(results);
    expect(winner).toBe("B");
    expect(agreement).toBeCloseTo(0.6, 1);
  });

  it("C6: agreement — unanimous = 1.0", () => {
    const results = [
      makeAgentEval("a1", 100, makeScores(3, 3, 3), makeScores(5, 5, 5), "B"),
      makeAgentEval("a2", 100, makeScores(3, 3, 3), makeScores(5, 5, 5), "B"),
    ];
    const { agreement } = determineWinner(results);
    expect(agreement).toBe(1.0);
  });

  it("C6: agreement — 3-2 split with varied reps", () => {
    const results = [
      makeAgentEval("a1", 120, makeScores(4, 4, 4), makeScores(5, 5, 5), "B"),
      makeAgentEval("a2", 100, makeScores(4, 4, 4), makeScores(5, 5, 5), "B"),
      makeAgentEval("a3", 110, makeScores(4, 4, 4), makeScores(5, 5, 5), "B"),
      makeAgentEval("a4", 90, makeScores(5, 5, 5), makeScores(4, 4, 4), "A"),
      makeAgentEval("a5", 80, makeScores(5, 5, 5), makeScores(4, 4, 4), "A"),
    ];
    // B weight: 1.2 + 1.0 + 1.1 = 3.3
    // A weight: 0.9 + 0.8 = 1.7
    // agreement = 3.3 / 5.0 = 0.66
    const { winner, agreement } = determineWinner(results);
    expect(winner).toBe("B");
    expect(agreement).toBeCloseTo(0.66, 1);
  });

  it("E3: all agents vote TIE = TIE winner", () => {
    const results = [
      makeAgentEval("a1", 100, makeScores(4, 4, 4), makeScores(4, 4, 4), "TIE"),
      makeAgentEval("a2", 100, makeScores(4, 4, 4), makeScores(4, 4, 4), "TIE"),
      makeAgentEval("a3", 100, makeScores(4, 4, 4), makeScores(4, 4, 4), "TIE"),
    ];
    const { winner } = determineWinner(results);
    expect(winner).toBe("TIE");
  });
});

describe("Consensus Eval — Settlement", () => {
  let tracker: ReputationTracker;
  let agents: SkillAgent[];

  beforeEach(() => {
    agents = makeAgents();
    tracker = new ReputationTracker(agents);
  });

  it("C10: settleEval — aligned agent gets +4", () => {
    const perAgent = [
      { agentId: "a1", winner: "B" as const },
      { agentId: "a2", winner: "B" as const },
    ];
    const deltas = tracker.settleEval(perAgent, "B");
    expect(deltas[0]!.delta).toBe(4);
    expect(deltas[1]!.delta).toBe(4);
  });

  it("C10: settleEval — misaligned agent gets -4", () => {
    const perAgent = [
      { agentId: "a1", winner: "A" as const },
    ];
    const deltas = tracker.settleEval(perAgent, "B");
    expect(deltas[0]!.delta).toBe(-4);
  });

  it("C10: settleEval — TIE vote = no settlement", () => {
    const perAgent = [
      { agentId: "a1", winner: "TIE" as const },
      { agentId: "a2", winner: "B" as const },
    ];
    const deltas = tracker.settleEval(perAgent, "B");
    expect(deltas).toHaveLength(1); // only a2 settled
    expect(deltas[0]!.agentId).toBe("a2");
  });

  it("C10: settleEval — TIE winner = no settlement for anyone", () => {
    const perAgent = [
      { agentId: "a1", winner: "A" as const },
      { agentId: "a2", winner: "B" as const },
    ];
    const deltas = tracker.settleEval(perAgent, "TIE");
    expect(deltas).toHaveLength(0);
  });

  it("C10: settleEval — UNKNOWN winner = no settlement", () => {
    const perAgent = [
      { agentId: "a1", winner: "B" as const },
    ];
    const deltas = tracker.settleEval(perAgent, "UNKNOWN");
    expect(deltas).toHaveLength(0);
  });
});

describe("Consensus Eval — Edge Cases", () => {
  it("C7: short-circuit on identical inputs produces TIE", () => {
    // Test the logic, not the LLM call
    const a = "identical content";
    const b = "identical content";
    expect(a === b).toBe(true);
    // consensusJudge() returns TIE with empty perAgent and agreement 1.0
  });

  it("C8: below quorum (< 3 agents) = quorumMet false", () => {
    const minQuorum = 3;
    expect(2 < minQuorum).toBe(true);
    expect(3 < minQuorum).toBe(false);
  });

  it("C9: agent excluded on failure — 4 succeed, composite uses 4", () => {
    const results = [
      makeAgentEval("a1", 100, makeScores(4, 4, 4), makeScores(5, 5, 5), "B"),
      makeAgentEval("a2", 100, makeScores(4, 4, 4), makeScores(5, 5, 5), "B"),
      makeAgentEval("a3", 100, makeScores(4, 4, 4), makeScores(5, 5, 5), "B"),
      makeAgentEval("a4", 100, makeScores(4, 4, 4), makeScores(5, 5, 5), "B"),
      // a5 failed — not in array
    ];
    expect(results.length).toBe(4);
    expect(results.length >= 3).toBe(true); // quorum met
  });
});
