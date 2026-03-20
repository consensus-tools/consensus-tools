import type {
  GuardVote,
  GuardPolicy,
  GuardResult,
  GuardDecision,
  GuardType,
  WeightedGuardVote,
  WeightingMode,
  VoteTally,
} from "@consensus-tools/schemas";
import { computeEffectiveWeight, tallyVotes, reachesQuorum } from "./voting.js";

/**
 * Finalize a set of single-evaluator votes into a guard decision.
 * Used for the lean (deterministic, single-evaluator) path.
 */
export function finalizeVotes(
  votes: GuardVote[],
  actionType: string,
  policy?: GuardPolicy,
): Omit<GuardResult, "audit_id"> {
  const top = votes[0];
  if (!top) {
    return { decision: "ALLOW", reason: "No votes cast", risk_score: 0 };
  }

  if (top.vote === "NO") {
    return { decision: "BLOCK", reason: top.reason, risk_score: top.risk };
  }

  if (top.vote === "REWRITE") {
    const hitlThreshold = policy?.hitlRequiredAboveRisk;
    const requireHuman = hitlThreshold !== undefined ? top.risk >= hitlThreshold : actionType === "code_merge";

    if (requireHuman) {
      return {
        decision: "REQUIRE_HUMAN",
        reason: top.reason,
        risk_score: top.risk,
        next_step: { tool: "human.approve", input: { reason: top.reason } },
      };
    }
    return {
      decision: "REWRITE",
      reason: top.reason,
      risk_score: top.risk,
      suggested_rewrite: "Revise high-risk content and retry.",
    };
  }

  return { decision: "ALLOW", reason: top.reason, risk_score: top.risk };
}

/**
 * Three-step weighted decision model for multi-agent guard evaluation.
 *
 * Step 1: Combined risk > threshold →
 *   1a: Any NO vote → BLOCK
 *   1b: Majority REWRITE (no NOs) → REWRITE
 *   1c: Otherwise → BLOCK
 * Step 2: Quorum not met → REQUIRE_HUMAN
 * Step 3: Risk acceptable + quorum met → ALLOW
 */
export function computeDecision(
  votes: WeightedGuardVote[],
  policy: GuardPolicy,
  weightingMode: WeightingMode = "hybrid",
): {
  decision: GuardDecision;
  tally: VoteTally;
  quorumMet: boolean;
  weightedYesRatio: number;
  combinedRisk: number;
} {
  const tally = tallyVotes(votes, weightingMode);

  let riskNum = 0;
  let riskDen = 0;
  for (const v of votes) {
    const ew = computeEffectiveWeight(v.weight, v.reputation ?? 100, weightingMode);
    riskNum += v.risk * ew;
    riskDen += ew;
  }
  const combinedRisk = riskDen > 0 ? riskNum / riskDen : 0.5;

  const weightedYesRatio = tally.totalWeight > 0 ? tally.weightedYes / tally.totalWeight : 0;
  const quorumMet = reachesQuorum(tally, policy.quorum);

  // Step 1: Combined risk exceeds threshold
  if (combinedRisk > policy.riskThreshold) {
    if (tally.no > 0) {
      return { decision: "BLOCK", tally, quorumMet, weightedYesRatio, combinedRisk };
    }

    const rewriteRatio = tally.totalWeight > 0 ? tally.weightedRewrite / tally.totalWeight : 0;
    if (tally.rewrite > 0 && rewriteRatio > 0.5) {
      return { decision: "REWRITE", tally, quorumMet, weightedYesRatio, combinedRisk };
    }

    return { decision: "BLOCK", tally, quorumMet, weightedYesRatio, combinedRisk };
  }

  // Step 2: Quorum not met
  if (!quorumMet || weightedYesRatio < policy.quorum) {
    return { decision: "REQUIRE_HUMAN", tally, quorumMet, weightedYesRatio, combinedRisk };
  }

  // Step 3: Risk acceptable and quorum met
  return { decision: "ALLOW", tally, quorumMet, weightedYesRatio, combinedRisk };
}

/**
 * Normalize an action type string to a known GuardType,
 * falling back to "agent_action" for unknown types.
 */
export function normalizeGuardType(type: string): GuardType {
  const valid: GuardType[] = [
    "send_email",
    "code_merge",
    "publish",
    "support_reply",
    "agent_action",
    "deployment",
    "permission_escalation",
    "seo_fix",
    "diff_check",
  ];
  if (valid.includes(type as GuardType)) return type as GuardType;
  return "agent_action";
}
