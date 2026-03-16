import type { AgentPersona } from "./personas.js";
import type { ReputationDelta, ReputationState, ReputationStorage } from "./types.js";

const REP_FLOOR = 10;
const DEFAULT_REP = 100;

type AgentWithRep = AgentPersona & { reputation: number };

/**
 * Tracks agent reputation across evaluation and proposal rounds.
 *
 *   SETTLEMENT (±4 symmetric — no dominant strategy):
 *   ┌─────────────────────┬──────────────┬──────────────┐
 *   │                     │ Aligned with │ Against      │
 *   │                     │ ground truth │ ground truth │
 *   ├─────────────────────┼──────────────┼──────────────┤
 *   │ Agent voted A or B  │    +4        │    -4        │
 *   │ Agent voted TIE     │ no change    │ no change    │
 *   └─────────────────────┴──────────────┴──────────────┘
 *
 * Reputation floor: 10 (agents are never fully silenced).
 * Persistence via pluggable ReputationStorage interface.
 */
export class ReputationTracker {
  private reputations: Map<string, number>;
  private storage: ReputationStorage | null;
  private totalRounds: number = 0;

  constructor(agents: AgentWithRep[], storage?: ReputationStorage) {
    this.storage = storage ?? null;
    this.reputations = new Map(agents.map((a) => [a.id, a.reputation]));
  }

  async loadFromStorage(): Promise<boolean> {
    if (!this.storage) return false;
    const state = await this.storage.load();
    if (!state) return false;
    for (const [id, rep] of Object.entries(state.reputations)) {
      this.reputations.set(id, rep);
    }
    this.totalRounds = state.totalRounds;
    return true;
  }

  async saveToStorage(): Promise<void> {
    if (!this.storage) return;
    await this.storage.save({
      reputations: Object.fromEntries(this.reputations),
      totalRounds: this.totalRounds,
      lastUpdated: new Date().toISOString(),
    });
  }

  isLoaded(): boolean {
    return this.totalRounds > 0;
  }

  getTotalRounds(): number {
    return this.totalRounds;
  }

  incrementRounds(): void {
    this.totalRounds++;
  }

  getReputation(agentId: string): number {
    return this.reputations.get(agentId) ?? DEFAULT_REP;
  }

  payout(agentId: string, amount: number, reason: string): ReputationDelta {
    const current = this.getReputation(agentId);
    const newRep = current + amount;
    this.reputations.set(agentId, newRep);
    return { agentId, delta: amount, reason, newReputation: newRep };
  }

  slash(agentId: string, amount: number, reason: string): ReputationDelta {
    const current = this.getReputation(agentId);
    const newRep = Math.max(REP_FLOOR, current - amount);
    const actualDelta = -(current - newRep);
    this.reputations.set(agentId, newRep);
    return { agentId, delta: actualDelta, reason, newReputation: newRep };
  }

  getLeaderboard(): { agentId: string; reputation: number }[] {
    return [...this.reputations.entries()]
      .map(([agentId, reputation]) => ({ agentId, reputation }))
      .sort((a, b) => b.reputation - a.reputation);
  }

  /**
   * Settle after A/B eval. ±4 symmetric.
   * No settlement on TIE/UNKNOWN winner or TIE votes.
   */
  settleEval(
    perAgent: { agentId: string; winner: "A" | "B" | "TIE" }[],
    actualWinner: "A" | "B" | "TIE" | "UNKNOWN",
  ): ReputationDelta[] {
    if (actualWinner === "TIE" || actualWinner === "UNKNOWN") return [];
    const deltas: ReputationDelta[] = [];
    for (const agent of perAgent) {
      if (agent.winner === "TIE") continue;
      if (agent.winner === actualWinner) {
        deltas.push(this.payout(agent.agentId, 4, `Correctly identified ${actualWinner} as better`));
      } else {
        deltas.push(this.slash(agent.agentId, 4, `Voted ${agent.winner} but ${actualWinner} was better`));
      }
    }
    return deltas;
  }

  /**
   * Settle after guard proposal round. ±4 symmetric.
   * Judge scores are ground truth.
   */
  settleRound(
    votes: { evaluator: string; vote: string }[],
    judgeScores: { clarity: number; completeness: number; actionability: number },
    proposerId: string,
    decision: string,
    rewriteCount: number,
    maxRewrites: number,
  ): ReputationDelta[] {
    const deltas: ReputationDelta[] = [];
    const passes = judgeScores.clarity >= 4 && judgeScores.completeness >= 4 && judgeScores.actionability >= 4;

    for (const vote of votes) {
      if (vote.evaluator === proposerId) continue;
      if (vote.vote === "YES") {
        deltas.push(passes
          ? this.payout(vote.evaluator, 4, "Voted YES, judge confirmed quality")
          : this.slash(vote.evaluator, 4, "Voted YES, but judge found quality issues"));
      } else {
        deltas.push(passes
          ? this.slash(vote.evaluator, 4, `Voted ${vote.vote}, but judge confirmed quality`)
          : this.payout(vote.evaluator, 4, `Voted ${vote.vote}, judge agreed on issues`));
      }
    }

    if (decision === "ALLOW" && passes) {
      deltas.push(this.payout(proposerId, 5, "Proposal accepted and judge confirmed quality"));
    } else if (rewriteCount >= maxRewrites && decision !== "ALLOW") {
      deltas.push(this.slash(proposerId, 8, "Proposal failed after max rewrites"));
    }
    if (rewriteCount > 0 && decision === "ALLOW") {
      deltas.push(this.payout(proposerId, 2, "Rewrite improved proposal to acceptance"));
    }

    return deltas;
  }

  syncToAgents(agents: AgentWithRep[]): void {
    for (const agent of agents) {
      agent.reputation = this.getReputation(agent.id);
    }
  }
}
