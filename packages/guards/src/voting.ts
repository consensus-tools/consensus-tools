import type { WeightedGuardVote, WeightingMode, VoteTally } from "@consensus-tools/schemas";

/**
 * Compute effective weight used in decisions based on weighting mode.
 * - static:     raw weight (ignore reputation)
 * - reputation: reputation/100 (ignore manual weight)
 * - hybrid:     weight * (reputation/100)
 */
export function computeEffectiveWeight(weight: number, reputation: number, mode: WeightingMode = "hybrid"): number {
  switch (mode) {
    case "static":
      return weight;
    case "reputation":
      return reputation / 100;
    case "hybrid":
      return weight * (reputation / 100);
  }
}

export function tallyVotes(votes: WeightedGuardVote[], weightingMode: WeightingMode = "hybrid"): VoteTally {
  const tally: VoteTally = {
    yes: 0,
    no: 0,
    rewrite: 0,
    totalWeight: 0,
    weightedYes: 0,
    weightedNo: 0,
    weightedRewrite: 0,
    voterCount: votes.length,
  };

  for (const v of votes) {
    const baseWeight = computeEffectiveWeight(v.weight, v.reputation ?? 100, weightingMode);
    const effectiveWeight = baseWeight * v.confidence;
    tally.totalWeight += effectiveWeight;

    if (v.vote === "YES") {
      tally.yes++;
      tally.weightedYes += effectiveWeight;
    } else if (v.vote === "NO") {
      tally.no++;
      tally.weightedNo += effectiveWeight;
    } else if (v.vote === "REWRITE") {
      tally.rewrite++;
      tally.weightedRewrite += effectiveWeight;
    }
  }

  return tally;
}

export function reachesQuorum(tally: VoteTally, quorum: number): boolean {
  if (tally.totalWeight === 0) return false;
  const participationRatio = tally.voterCount > 0 ? 1 : 0;
  return tally.totalWeight >= quorum && participationRatio > 0;
}
