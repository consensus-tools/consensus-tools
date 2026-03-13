// @consensus-tools/policies
// Built-in consensus policy implementations.
// Re-exports canonical implementations from @consensus-tools/core
// and adds a pluggable registry wrapper.

export {
  firstSubmissionWins,
  highestConfidenceSingle,
  approvalVote,
  ownerPick,
  trustedArbiter,
  topKSplit,
  majorityVote,
  weightedVoteSimple,
  weightedReputation,
} from "@consensus-tools/core";
export { createPolicyRegistry, createRegistryResolver } from "./registry.js";
export type { PolicyRegistry } from "./registry.js";
