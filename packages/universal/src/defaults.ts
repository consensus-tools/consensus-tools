import type { UniversalConfig } from "./types.js";
import { DEFAULT_PERSONA_TRIO } from "@consensus-tools/guards";
export { DEFAULT_PERSONA_TRIO } from "@consensus-tools/guards";

// ── Default Configuration ────────────────────────────────────────────

/**
 * Hint identifier used by external tooling to refer to the agent-action guard.
 * NOT used as a default in DEFAULTS.guards — that uses the full persona trio
 * (security, compliance, user-impact) so default-config callers get real evaluation.
 */
export const DEFAULT_GUARD = "agent_action";
export const DEFAULT_POLICY = "majority";
export const DEFAULT_PERSONA_COUNT = 3;
export const DEFAULT_PACK = "default";
export const DEFAULT_PERSONA_TIMEOUT_MS = 3000;
export const DEFAULT_RESPAWN_THRESHOLD = 0.15;

export const DEFAULTS: Required<
  Pick<UniversalConfig, "policy" | "guards" | "failPolicy" | "storage" | "logger">
> = {
  policy: DEFAULT_POLICY,
  // Use the full trio so default-config callers get 3 real voters with active
  // regex evaluation (security, compliance, user-impact). Using a single
  // unknown domain here would make the default a rubber stamp.
  guards: [...DEFAULT_PERSONA_TRIO],
  failPolicy: "closed",
  storage: "memory",
  logger: true,
};

// ── Core Policy Type Names ───────────────────────────────────────────
// All 9 policies supported by resolveConsensus() in @consensus-tools/core.
// All deliberations route through resolveConsensus() — there is no
// separate strategy aggregator.

export const CORE_POLICY_TYPES = new Set([
  "FIRST_SUBMISSION_WINS",
  "HIGHEST_CONFIDENCE_SINGLE",
  "APPROVAL_VOTE",
  "OWNER_PICK",
  "TOP_K_SPLIT",
  "MAJORITY_VOTE",
  "WEIGHTED_VOTE_SIMPLE",
  "WEIGHTED_REPUTATION",
  "TRUSTED_ARBITER",
]);

// ── Friendly → Core Policy Mapping ───────────────────────────────────
// Maps friendly names (used in facade config) to core policy type names.

const FRIENDLY_TO_CORE: Record<string, string> = {
  majority: "MAJORITY_VOTE",
  supermajority: "APPROVAL_VOTE",
  unanimous: "APPROVAL_VOTE",
  weighted_reputation: "WEIGHTED_REPUTATION",
  first_wins: "FIRST_SUBMISSION_WINS",
  highest_confidence: "HIGHEST_CONFIDENCE_SINGLE",
  top_k: "TOP_K_SPLIT",
  owner_pick: "OWNER_PICK",
  arbiter: "TRUSTED_ARBITER",
};

/**
 * Resolve a policy string to a core policy type name for LLM mode.
 * Accepts friendly names, core names, and threshold:X patterns.
 */
export function resolvePolicyType(policy: string): string {
  // Direct core policy name
  if (CORE_POLICY_TYPES.has(policy)) return policy;

  // Friendly name mapping
  const mapped = FRIENDLY_TO_CORE[policy];
  if (mapped) return mapped;

  // threshold:X -> APPROVAL_VOTE with custom config
  if (policy.startsWith("threshold:")) return "APPROVAL_VOTE";

  // Unknown policy — warn and fall back
  console.warn( // eslint-disable-line no-console
    `[consensus] Unknown LLM policy "${policy}", falling back to MAJORITY_VOTE. ` +
    `Valid: ${[...CORE_POLICY_TYPES].join(", ")} or friendly names: ${Object.keys(FRIENDLY_TO_CORE).join(", ")}`,
  );
  return "MAJORITY_VOTE";
}

