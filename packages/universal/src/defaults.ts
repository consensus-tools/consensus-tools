import type { StrategyConfig } from "@consensus-tools/wrapper";
import type { UniversalConfig } from "./types.js";
import { ConfigError } from "./errors.js";
export { DEFAULT_PERSONA_TRIO } from "@consensus-tools/guards";

// ── Default Configuration ────────────────────────────────────────────

export const DEFAULT_GUARD = "agent_action";
export const DEFAULT_POLICY = "majority";
export const DEFAULT_PERSONA_COUNT = 3;

export const DEFAULTS: Required<
  Pick<UniversalConfig, "policy" | "guards" | "failPolicy" | "storage" | "logger">
> = {
  policy: DEFAULT_POLICY,
  guards: [DEFAULT_GUARD],
  failPolicy: "closed",
  storage: "memory",
  logger: true,
};

// ── Policy-to-Strategy Mapping ───────────────────────────────────────

/**
 * Maps a user-facing policy name to a wrapper StrategyConfig.
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

      throw new ConfigError(
        `Unknown policy "${policy}". ` +
        `Supported: 'majority', 'supermajority', 'unanimous', 'threshold:X' (where X is 0-1).`,
      );
    }
  }
}
