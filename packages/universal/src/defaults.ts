import type { StrategyConfig } from "@consensus-tools/wrapper";
import type { UniversalConfig } from "./types.js";
import { ConfigError } from "./errors.js";
export { DEFAULT_PERSONA_TRIO } from "@consensus-tools/guards";

// ── Default Configuration ────────────────────────────────────────────

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
  guards: [DEFAULT_GUARD],
  failPolicy: "closed",
  storage: "memory",
  logger: true,
};

// ── Core Policy Type Names ───────────────────────────────────────────
// All 9 policies supported by resolveConsensus() in @consensus-tools/core.
// These are used in LLM mode where we bypass the wrapper and call
// resolveConsensus() directly.

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

  // Default to MAJORITY_VOTE
  return "MAJORITY_VOTE";
}

// ── Policy-to-Strategy Mapping (regex mode) ──────────────────────────

/**
 * Maps a user-facing policy name to a wrapper StrategyConfig.
 * Used in regex-only mode (no model provided).
 *
 * Supported names:
 *   'majority'        -> { strategy: 'majority' }
 *   'supermajority'   -> { strategy: 'threshold', threshold: 0.67 }
 *   'unanimous'       -> { strategy: 'unanimous' }
 *   'threshold:X'     -> { strategy: 'threshold', threshold: X }
 *
 * @throws ConfigError for unrecognized policy names.
 */
export function policyToStrategy(policy: string): StrategyConfig {
  switch (policy) {
    case "majority":
      return { strategy: "majority" };
    case "supermajority":
      return { strategy: "threshold", threshold: 0.67 };
    case "unanimous":
      return { strategy: "unanimous" };
    default: {
      // Handle 'threshold:X' pattern
      if (policy.startsWith("threshold:")) {
        const value = Number(policy.slice("threshold:".length));
        if (Number.isNaN(value) || value < 0 || value > 1) {
          throw new ConfigError(
            `Invalid threshold value in policy "${policy}". Expected a number between 0 and 1.`,
          );
        }
        return { strategy: "threshold", threshold: value };
      }

      // In LLM mode, core policy names are valid. In regex mode, they're not.
      // Let the caller decide — we just throw for truly unknown strings.
      if (CORE_POLICY_TYPES.has(policy) || FRIENDLY_TO_CORE[policy]) {
        // Valid LLM-mode policy used in regex mode — fall back to majority
        return { strategy: "majority" };
      }

      throw new ConfigError(
        `Unknown policy "${policy}". ` +
        `Supported: 'majority', 'supermajority', 'unanimous', 'threshold:X' (where X is 0-1).` +
        ` For LLM mode, also: ${[...CORE_POLICY_TYPES].join(", ")}.`,
      );
    }
  }
}
