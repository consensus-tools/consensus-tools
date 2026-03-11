import type { ConsensusPolicyType, PolicyResolver } from "@consensus-tools/schemas";
import { firstSubmissionWins } from "./first-submission-wins.js";
import { highestConfidenceSingle } from "./highest-confidence-single.js";
import { approvalVote } from "./approval-vote.js";
import { ownerPick } from "./owner-pick.js";
import { trustedArbiter } from "./trusted-arbiter.js";
import { topKSplit } from "./top-k-split.js";
import { majorityVote, weightedVoteSimple, weightedReputation } from "./vote-based.js";

/** Map of built-in policy type → resolver function. */
export type PolicyRegistry = Map<ConsensusPolicyType, PolicyResolver>;

/**
 * Creates a registry populated with all built-in policy resolvers.
 * Custom policies can be added via registry.set() after creation.
 */
export function createPolicyRegistry(): PolicyRegistry {
  const registry: PolicyRegistry = new Map();
  registry.set("FIRST_SUBMISSION_WINS", firstSubmissionWins);
  registry.set("HIGHEST_CONFIDENCE_SINGLE", highestConfidenceSingle);
  registry.set("APPROVAL_VOTE", approvalVote);
  registry.set("OWNER_PICK", ownerPick);
  registry.set("TRUSTED_ARBITER", trustedArbiter);
  registry.set("TOP_K_SPLIT", topKSplit);
  registry.set("MAJORITY_VOTE", majorityVote);
  registry.set("WEIGHTED_VOTE_SIMPLE", weightedVoteSimple);
  registry.set("WEIGHTED_REPUTATION", weightedReputation);
  return registry;
}

/**
 * Creates a PolicyResolver function that dispatches to the appropriate
 * policy from the registry based on job.consensusPolicy.type.
 */
export function createRegistryResolver(registry?: PolicyRegistry): PolicyResolver {
  const reg = registry ?? createPolicyRegistry();
  return (input) => {
    const policyType = input.job.consensusPolicy.type;
    const resolver = reg.get(policyType);
    if (!resolver) {
      throw new Error(`Unknown consensus policy: ${policyType}`);
    }
    return resolver(input);
  };
}
