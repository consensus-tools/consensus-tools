// @consensus-tools/policies
// Built-in consensus policy implementations.
// Depends on @consensus-tools/schemas and @consensus-tools/core.

export { firstSubmissionWins } from "./first-submission-wins.js";
export { highestConfidenceSingle } from "./highest-confidence-single.js";
export { approvalVote } from "./approval-vote.js";
export { ownerPick } from "./owner-pick.js";
export { trustedArbiter } from "./trusted-arbiter.js";
export { topKSplit } from "./top-k-split.js";
export { majorityVote, weightedVoteSimple, weightedReputation } from "./vote-based.js";
export { createPolicyRegistry, createRegistryResolver } from "./registry.js";
export type { PolicyRegistry } from "./registry.js";
