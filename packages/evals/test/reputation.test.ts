import { describe, it, expect, beforeEach } from "vitest";
import { ReputationTracker } from "../src/reputation.js";
import type { AgentPersona } from "../src/personas.js";

type AgentWithRep = AgentPersona & { reputation: number };

function makeAgents(reps: number[] = [100, 100, 100]): AgentWithRep[] {
  return reps.map((rep, i) => ({
    id: `a${i + 1}`,
    name: `Agent ${i + 1}`,
    role: `r${i + 1}`,
    systemPrompt: "",
    evaluationFocus: "",
    reputation: rep,
  }));
}

describe("ReputationTracker", () => {
  let tracker: ReputationTracker;

  beforeEach(() => {
    tracker = new ReputationTracker(makeAgents());
  });

  it("initializes at given reputation", () => {
    expect(tracker.getReputation("a1")).toBe(100);
  });

  it("returns default 100 for unknown agent", () => {
    expect(tracker.getReputation("unknown")).toBe(100);
  });

  it("payout increases reputation", () => {
    const delta = tracker.payout("a1", 4, "test");
    expect(delta.delta).toBe(4);
    expect(delta.newReputation).toBe(104);
    expect(tracker.getReputation("a1")).toBe(104);
  });

  it("slash decreases reputation", () => {
    const delta = tracker.slash("a1", 3, "test");
    expect(delta.delta).toBe(-3);
    expect(delta.newReputation).toBe(97);
  });

  it("enforces floor at 10", () => {
    const delta = tracker.slash("a1", 200, "big slash");
    expect(delta.newReputation).toBe(10);
    expect(tracker.getReputation("a1")).toBe(10);
  });

  it("leaderboard sorts descending", () => {
    tracker.payout("a3", 10, "boost");
    tracker.slash("a1", 5, "penalty");
    const board = tracker.getLeaderboard();
    expect(board[0]!.agentId).toBe("a3");
    expect(board[board.length - 1]!.agentId).toBe("a1");
  });

  it("tracks total rounds", () => {
    expect(tracker.getTotalRounds()).toBe(0);
    tracker.incrementRounds();
    tracker.incrementRounds();
    expect(tracker.getTotalRounds()).toBe(2);
  });

  it("isLoaded false for fresh tracker", () => {
    expect(tracker.isLoaded()).toBe(false);
  });

  it("syncToAgents updates agent objects", () => {
    const agents = makeAgents();
    const t = new ReputationTracker(agents);
    t.payout("a1", 15, "test");
    t.syncToAgents(agents);
    expect(agents[0]!.reputation).toBe(115);
  });

  describe("settleEval", () => {
    it("rewards aligned agent +4", () => {
      const deltas = tracker.settleEval([{ agentId: "a1", winner: "B" }], "B");
      expect(deltas[0]!.delta).toBe(4);
    });

    it("slashes misaligned agent -4", () => {
      const deltas = tracker.settleEval([{ agentId: "a1", winner: "A" }], "B");
      expect(deltas[0]!.delta).toBe(-4);
    });

    it("no settlement on TIE winner", () => {
      const deltas = tracker.settleEval([{ agentId: "a1", winner: "B" }], "TIE");
      expect(deltas).toHaveLength(0);
    });

    it("no settlement on UNKNOWN winner", () => {
      const deltas = tracker.settleEval([{ agentId: "a1", winner: "B" }], "UNKNOWN");
      expect(deltas).toHaveLength(0);
    });

    it("TIE vote = no settlement for that agent", () => {
      const deltas = tracker.settleEval(
        [{ agentId: "a1", winner: "TIE" }, { agentId: "a2", winner: "B" }],
        "B",
      );
      expect(deltas).toHaveLength(1);
      expect(deltas[0]!.agentId).toBe("a2");
    });
  });

  describe("settleRound", () => {
    it("rewards YES voters when judge passes", () => {
      const votes = [{ evaluator: "a2", vote: "YES" }];
      const scores = { clarity: 4, completeness: 4, actionability: 4 };
      const deltas = tracker.settleRound(votes, scores, "a1", "ALLOW", 0, 2);
      expect(deltas.find((d) => d.agentId === "a2")!.delta).toBe(4);
    });

    it("slashes YES voters when judge fails", () => {
      const votes = [{ evaluator: "a2", vote: "YES" }];
      const scores = { clarity: 3, completeness: 2, actionability: 3 };
      const deltas = tracker.settleRound(votes, scores, "a1", "ALLOW", 0, 2);
      expect(deltas.find((d) => d.agentId === "a2")!.delta).toBe(-4);
    });

    it("rewards proposer on accepted + passing", () => {
      const scores = { clarity: 4, completeness: 4, actionability: 4 };
      const deltas = tracker.settleRound([], scores, "a1", "ALLOW", 0, 2);
      expect(deltas.find((d) => d.agentId === "a1")!.delta).toBe(5);
    });

    it("skips proposer in guard settlement", () => {
      const votes = [{ evaluator: "a1", vote: "YES" }, { evaluator: "a2", vote: "YES" }];
      const scores = { clarity: 4, completeness: 4, actionability: 4 };
      const deltas = tracker.settleRound(votes, scores, "a1", "ALLOW", 0, 2);
      const a1Deltas = deltas.filter((d) => d.agentId === "a1");
      expect(a1Deltas).toHaveLength(1); // only proposer reward, not guard reward
      expect(a1Deltas[0]!.delta).toBe(5);
    });
  });
});
