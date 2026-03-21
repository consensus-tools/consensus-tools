import { describe, it, expect, beforeEach } from "vitest";
import { ReputationTracker } from "../lib/reputation.js";
import type { SkillAgent, GuardVoteResult, JudgeScore, GuardPipelineResult } from "../lib/types.js";

function makeAgents(): SkillAgent[] {
  return [
    { id: "a1", name: "Agent 1", role: "r1", systemPrompt: "", evaluationFocus: "", reputation: 100 },
    { id: "a2", name: "Agent 2", role: "r2", systemPrompt: "", evaluationFocus: "", reputation: 100 },
    { id: "a3", name: "Agent 3", role: "r3", systemPrompt: "", evaluationFocus: "", reputation: 100 },
    { id: "a4", name: "Agent 4", role: "r4", systemPrompt: "", evaluationFocus: "", reputation: 100 },
    { id: "a5", name: "Agent 5", role: "r5", systemPrompt: "", evaluationFocus: "", reputation: 100 },
  ];
}

function makeGuardResult(decision: "ALLOW" | "BLOCK" | "REWRITE"): GuardPipelineResult {
  return {
    decision,
    votes: [],
    combinedRisk: 0.3,
    quorumMet: true,
    weightedYesRatio: 0.6,
    tally: { yes: 3, no: 0, rewrite: 2, totalWeight: 5, weightedYes: 3, weightedNo: 0, weightedRewrite: 2, voterCount: 5 },
  };
}

function passingScores(): JudgeScore {
  return { clarity: 4, completeness: 4, actionability: 4, reasoning: "good" };
}

function failingScores(): JudgeScore {
  return { clarity: 3, completeness: 2, actionability: 3, reasoning: "needs work" };
}

describe("ReputationTracker", () => {
  let tracker: ReputationTracker;
  let agents: SkillAgent[];

  beforeEach(() => {
    agents = makeAgents();
    tracker = new ReputationTracker(agents);
  });

  it("initializes all agents at 100", () => {
    for (const a of agents) {
      expect(tracker.getReputation(a.id)).toBe(100);
    }
  });

  it("payout increases reputation", () => {
    const delta = tracker.payout("a1", 5, "test");
    expect(delta.delta).toBe(5);
    expect(delta.newReputation).toBe(105);
    expect(tracker.getReputation("a1")).toBe(105);
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
    expect(board[0]!.reputation).toBe(110);
    expect(board[board.length - 1]!.agentId).toBe("a1");
  });

  describe("settleRound", () => {
    it("rewards YES voters when judge passes (+4 symmetric)", () => {
      const votes: GuardVoteResult[] = [
        { evaluator: "a2", vote: "YES", risk: 0.2, reason: "ok" },
        { evaluator: "a3", vote: "YES", risk: 0.3, reason: "ok" },
      ];
      const deltas = tracker.settleRound(votes, passingScores(), "a1", makeGuardResult("ALLOW"), 0, 2);
      const a2Delta = deltas.find((d) => d.agentId === "a2" && d.reason.includes("YES"));
      expect(a2Delta!.delta).toBe(4);
    });

    it("slashes YES voters when judge fails (-4 symmetric)", () => {
      const votes: GuardVoteResult[] = [
        { evaluator: "a2", vote: "YES", risk: 0.2, reason: "ok" },
      ];
      const deltas = tracker.settleRound(votes, failingScores(), "a1", makeGuardResult("ALLOW"), 0, 2);
      const a2Delta = deltas.find((d) => d.agentId === "a2");
      expect(a2Delta!.delta).toBe(-4);
    });

    it("rewards NO/REWRITE voters when judge fails (+4 symmetric)", () => {
      const votes: GuardVoteResult[] = [
        { evaluator: "a2", vote: "NO", risk: 0.7, reason: "bad" },
        { evaluator: "a3", vote: "REWRITE", risk: 0.6, reason: "needs work" },
      ];
      const deltas = tracker.settleRound(votes, failingScores(), "a1", makeGuardResult("BLOCK"), 0, 2);
      const a2Delta = deltas.find((d) => d.agentId === "a2");
      expect(a2Delta!.delta).toBe(4);
    });

    it("slashes NO/REWRITE voters when judge passes (-4 symmetric)", () => {
      const votes: GuardVoteResult[] = [
        { evaluator: "a2", vote: "NO", risk: 0.7, reason: "bad" },
      ];
      const deltas = tracker.settleRound(votes, passingScores(), "a1", makeGuardResult("ALLOW"), 0, 2);
      const a2Delta = deltas.find((d) => d.agentId === "a2");
      expect(a2Delta!.delta).toBe(-4);
    });

    it("rewards proposer on accepted + passing proposal", () => {
      const votes: GuardVoteResult[] = [];
      const deltas = tracker.settleRound(votes, passingScores(), "a1", makeGuardResult("ALLOW"), 0, 2);
      const proposerDelta = deltas.find((d) => d.agentId === "a1");
      expect(proposerDelta!.delta).toBe(5);
    });

    it("slashes proposer on failed proposal after max rewrites", () => {
      const votes: GuardVoteResult[] = [];
      const deltas = tracker.settleRound(votes, failingScores(), "a1", makeGuardResult("BLOCK"), 2, 2);
      const proposerDelta = deltas.find((d) => d.agentId === "a1");
      expect(proposerDelta!.delta).toBe(-8);
    });

    it("rewards proposer with rewrite bonus", () => {
      const votes: GuardVoteResult[] = [];
      const deltas = tracker.settleRound(votes, passingScores(), "a1", makeGuardResult("ALLOW"), 1, 2);
      const rewriteBonus = deltas.find((d) => d.agentId === "a1" && d.reason.includes("Rewrite"));
      expect(rewriteBonus!.delta).toBe(2);
    });

    it("skips proposer in guard settlement", () => {
      const votes: GuardVoteResult[] = [
        { evaluator: "a1", vote: "YES", risk: 0.2, reason: "own proposal" },
        { evaluator: "a2", vote: "YES", risk: 0.2, reason: "ok" },
      ];
      const deltas = tracker.settleRound(votes, passingScores(), "a1", makeGuardResult("ALLOW"), 0, 2);
      // a1 should only get proposer reward (+5), not guard reward (+3)
      const a1Deltas = deltas.filter((d) => d.agentId === "a1");
      expect(a1Deltas).toHaveLength(1);
      expect(a1Deltas[0]!.delta).toBe(5);
    });
  });

  it("syncToAgents updates agent objects", () => {
    tracker.payout("a1", 15, "test");
    tracker.syncToAgents(agents);
    expect(agents[0]!.reputation).toBe(115);
  });

  describe("settleDiffGuard", () => {
    it("rewards YES voters when diff is accurate (+3)", () => {
      const votes: GuardVoteResult[] = [
        { evaluator: "a1", vote: "YES", risk: 0.1, reason: "ok" },
        { evaluator: "a2", vote: "YES", risk: 0.2, reason: "ok" },
      ];
      const deltas = tracker.settleDiffGuard(votes, true);
      expect(deltas[0]!.delta).toBe(3);
      expect(deltas[1]!.delta).toBe(3);
    });

    it("slashes YES voters when diff is inaccurate (-6)", () => {
      const votes: GuardVoteResult[] = [
        { evaluator: "a1", vote: "YES", risk: 0.1, reason: "looks fine" },
      ];
      const deltas = tracker.settleDiffGuard(votes, false);
      expect(deltas[0]!.delta).toBe(-6);
    });

    it("rewards NO/REWRITE voters when diff is inaccurate (+3)", () => {
      const votes: GuardVoteResult[] = [
        { evaluator: "a1", vote: "NO", risk: 0.7, reason: "flag is wrong" },
        { evaluator: "a2", vote: "REWRITE", risk: 0.5, reason: "needs fix" },
      ];
      const deltas = tracker.settleDiffGuard(votes, false);
      expect(deltas[0]!.delta).toBe(3);
      expect(deltas[1]!.delta).toBe(3);
    });

    it("slashes NO/REWRITE voters when diff is accurate (-3)", () => {
      const votes: GuardVoteResult[] = [
        { evaluator: "a1", vote: "NO", risk: 0.5, reason: "false alarm" },
      ];
      const deltas = tracker.settleDiffGuard(votes, true);
      expect(deltas[0]!.delta).toBe(-3);
    });
  });

  describe("persistence", () => {
    it("tracks total rounds", () => {
      expect(tracker.getTotalRounds()).toBe(0);
      tracker.incrementRounds();
      tracker.incrementRounds();
      expect(tracker.getTotalRounds()).toBe(2);
    });

    it("isLoaded returns false for fresh tracker", () => {
      expect(tracker.isLoaded()).toBe(false);
    });
  });
});
