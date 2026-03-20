import type { ConsensusPolicyType, ConsensusInput, ConsensusResult, PolicyResolver } from "@consensus-tools/schemas";
import { createPolicyRegistry, type PolicyRegistry } from "./registry.js";

/**
 * Policy template — extends one of the 9 base consensus algorithms
 * with custom configuration overrides and optional pre-checks.
 */

export interface PolicyTemplateConfig {
  /** Which of the 9 base policies to extend. */
  base: ConsensusPolicyType;
  /** Override policy config fields (quorum, riskThreshold, etc.). */
  overrides: Record<string, unknown>;
  /** Optional pre-check: return a result to short-circuit, or null to proceed. */
  preCheck?: (input: ConsensusInput) => ConsensusResult | null;
  /** Description for documentation. */
  description?: string;
}

export interface PolicyTemplate {
  name: string;
  base: ConsensusPolicyType;
  resolve: PolicyResolver;
  register: (registry: PolicyRegistry) => void;
  description: string;
}

const VALID_BASES: ConsensusPolicyType[] = [
  "FIRST_SUBMISSION_WINS",
  "HIGHEST_CONFIDENCE_SINGLE",
  "APPROVAL_VOTE",
  "OWNER_PICK",
  "TRUSTED_ARBITER",
  "TOP_K_SPLIT",
  "MAJORITY_VOTE",
  "WEIGHTED_VOTE_SIMPLE",
  "WEIGHTED_REPUTATION",
];

export function createPolicyTemplate(name: string, config: PolicyTemplateConfig): PolicyTemplate {
  const { base, overrides, preCheck, description = `Custom policy: ${name} (extends ${base})` } = config;

  if (!VALID_BASES.includes(base)) {
    throw new Error(`Unknown base policy: ${base}. Available: ${VALID_BASES.join(", ")}`);
  }

  // Get the base resolver from a fresh registry
  const baseRegistry = createPolicyRegistry();
  const baseResolver = baseRegistry.get(base);
  if (!baseResolver) {
    throw new Error(`Base policy resolver not found: ${base}`);
  }

  const resolve: PolicyResolver = (input: ConsensusInput): ConsensusResult => {
    // Run pre-check if provided
    if (preCheck) {
      const preResult = preCheck(input);
      if (preResult) return preResult;
    }

    // Merge overrides into the job's policy config
    const mergedInput: ConsensusInput = {
      ...input,
      job: {
        ...input.job,
        consensusPolicy: {
          ...input.job.consensusPolicy,
          type: base, // resolve with the base algorithm
          ...overrides,
        },
      },
    };

    return baseResolver(mergedInput);
  };

  function register(registry: PolicyRegistry): void {
    registry.set(name as any, resolve);
  }

  return { name, base, resolve, register, description };
}
