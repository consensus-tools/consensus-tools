import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import type { SkillAgent, GuardVoteResult, JudgeScore, ReputationDelta, GuardPipelineResult } from "./types.js";

const REP_FLOOR = 10;
const DEFAULT_REP = 100;

interface PersistedState {
  reputations: Record<string, number>;
  totalRounds: number;
  lastUpdated: string;
}

export class ReputationTracker {
  private reputations: Map<string, number>;
  private history: ReputationDelta[] = [];
  private persistPath: string | null;
  private totalRounds: number = 0;

  constructor(agents: SkillAgent[], persistPath?: string) {
    this.persistPath = persistPath ?? null;

    // Try to load persisted state
    const loaded = this.loadFromDisk();
    if (loaded) {
      this.reputations = new Map(Object.entries(loaded.reputations));
      this.totalRounds = loaded.totalRounds;
      // Ensure all current agents exist in the map (new agents start at default)
      for (const a of agents) {
        if (!this.reputations.has(a.id)) {
          this.reputations.set(a.id, DEFAULT_REP);
        }
      }
      // Sync loaded rep back to agent objects
      for (const a of agents) {
        a.reputation = this.getReputation(a.id);
      }
    } else {
      this.reputations = new Map(agents.map((a) => [a.id, a.reputation]));
    }
  }

  private loadFromDisk(): PersistedState | null {
    if (!this.persistPath) return null;
    try {
      if (!existsSync(this.persistPath)) return null;
      const raw = readFileSync(this.persistPath, "utf-8");
      return JSON.parse(raw) as PersistedState;
    } catch {
      return null;
    }
  }

  saveToDisk(): void {
    if (!this.persistPath) return;
    try {
      mkdirSync(dirname(this.persistPath), { recursive: true });
      const state: PersistedState = {
        reputations: Object.fromEntries(this.reputations),
        totalRounds: this.totalRounds,
        lastUpdated: new Date().toISOString(),
      };
      writeFileSync(this.persistPath, JSON.stringify(state, null, 2) + "\n", "utf-8");
    } catch (err: any) {
      console.error(`  [reputation] Failed to save: ${err.message}`);
    }
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
    const delta: ReputationDelta = { agentId, delta: amount, reason, newReputation: newRep };
    this.history.push(delta);
    return delta;
  }

  slash(agentId: string, amount: number, reason: string): ReputationDelta {
    const current = this.getReputation(agentId);
    const newRep = Math.max(REP_FLOOR, current - amount);
    const actualDelta = -(current - newRep);
    this.reputations.set(agentId, newRep);
    const delta: ReputationDelta = { agentId, delta: actualDelta, reason, newReputation: newRep };
    this.history.push(delta);
    return delta;
  }

  getLeaderboard(): { agentId: string; reputation: number }[] {
    return [...this.reputations.entries()]
      .map(([agentId, reputation]) => ({ agentId, reputation }))
      .sort((a, b) => b.reputation - a.reputation);
  }

  /**
   * Settle reputation after a round based on guard votes vs judge scores.
   *
   * Settlement rules — symmetric payoffs (judge is ground truth):
   *
   *   GUARD SETTLEMENT (±4 symmetric — no dominant strategy):
   *   ┌─────────────────────┬──────────────┬──────────────┐
   *   │                     │ Judge passes │ Judge fails   │
   *   ├─────────────────────┼──────────────┼──────────────┤
   *   │ Voted YES           │    +4        │    -4        │
   *   │ Voted NO / REWRITE  │    -4        │    +4        │
   *   └─────────────────────┴──────────────┴──────────────┘
   *
   *   PROPOSER SETTLEMENT:
   *   - Accepted + judge passes: +5
   *   - Failed after max rewrites: -8
   *   - Rewrite improved to acceptance: +2
   */
  settleRound(
    votes: GuardVoteResult[],
    judgeScores: JudgeScore,
    proposerId: string,
    guardResult: GuardPipelineResult,
    rewriteCount: number,
    maxRewrites: number,
  ): ReputationDelta[] {
    const deltas: ReputationDelta[] = [];
    const passes = judgeScores.clarity >= 4 && judgeScores.completeness >= 4 && judgeScores.actionability >= 4;

    for (const vote of votes) {
      if (vote.evaluator === proposerId) continue;

      if (vote.vote === "YES") {
        if (passes) {
          deltas.push(this.payout(vote.evaluator, 4, "Voted YES, judge confirmed quality"));
        } else {
          deltas.push(this.slash(vote.evaluator, 4, "Voted YES, but judge found quality issues"));
        }
      } else {
        if (passes) {
          deltas.push(this.slash(vote.evaluator, 4, `Voted ${vote.vote}, but judge confirmed quality`));
        } else {
          deltas.push(this.payout(vote.evaluator, 4, `Voted ${vote.vote}, judge agreed on issues`));
        }
      }
    }

    if (guardResult.decision === "ALLOW" && passes) {
      deltas.push(this.payout(proposerId, 5, "Proposal accepted and judge confirmed quality"));
    } else if (rewriteCount >= maxRewrites && guardResult.decision !== "ALLOW") {
      deltas.push(this.slash(proposerId, 8, "Proposal failed after max rewrites"));
    }

    if (rewriteCount > 0 && guardResult.decision === "ALLOW") {
      deltas.push(this.payout(proposerId, 2, "Rewrite improved proposal to acceptance"));
    }

    return deltas;
  }

  /**
   * Settle reputation for diff-guard review (code accuracy check).
   *
   *   DIFF GUARD SETTLEMENT (±3):
   *   - Voted YES + diff was accurate:   +3
   *   - Voted YES + diff had errors:     -6 (missed inaccuracies is worse)
   *   - Voted NO/REWRITE + diff had errors: +3
   *   - Voted NO/REWRITE + diff was accurate: -3
   */
  settleDiffGuard(
    votes: GuardVoteResult[],
    diffWasAccurate: boolean,
  ): ReputationDelta[] {
    const deltas: ReputationDelta[] = [];

    for (const vote of votes) {
      if (vote.vote === "YES") {
        if (diffWasAccurate) {
          deltas.push(this.payout(vote.evaluator, 3, "Correctly approved accurate diff"));
        } else {
          deltas.push(this.slash(vote.evaluator, 6, "Approved diff that had inaccuracies"));
        }
      } else {
        if (diffWasAccurate) {
          deltas.push(this.slash(vote.evaluator, 3, `Voted ${vote.vote} on accurate diff`));
        } else {
          deltas.push(this.payout(vote.evaluator, 3, `Correctly flagged inaccurate diff`));
        }
      }
    }

    return deltas;
  }

  /**
   * Settle reputation after a consensus eval round.
   *
   *   EVAL SETTLEMENT (±4 symmetric — matches proposal settlement):
   *   ┌─────────────────────┬──────────────┬──────────────┐
   *   │                     │ Aligned with │ Against      │
   *   │                     │ winner       │ winner       │
   *   ├─────────────────────┼──────────────┼──────────────┤
   *   │ Agent voted A or B  │    +4        │    -4        │
   *   │ Agent voted TIE     │ no change    │ no change    │
   *   └─────────────────────┴──────────────┴──────────────┘
   *
   *   No settlement on TIE winner or UNKNOWN winner.
   */
  settleEval(
    perAgent: { agentId: string; winner: "A" | "B" | "TIE" }[],
    actualWinner: "A" | "B" | "TIE" | "UNKNOWN",
  ): ReputationDelta[] {
    if (actualWinner === "TIE" || actualWinner === "UNKNOWN") return [];

    const deltas: ReputationDelta[] = [];
    for (const agent of perAgent) {
      if (agent.winner === "TIE") continue; // abstained — no settlement

      if (agent.winner === actualWinner) {
        deltas.push(this.payout(agent.agentId, 4, `Correctly identified ${actualWinner} as better`));
      } else {
        deltas.push(this.slash(agent.agentId, 4, `Voted ${agent.winner} but ${actualWinner} was better`));
      }
    }
    return deltas;
  }

  syncToAgents(agents: SkillAgent[]): void {
    for (const agent of agents) {
      agent.reputation = this.getReputation(agent.id);
    }
  }
}
