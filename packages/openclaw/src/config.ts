import type { ConsensusToolsConfig } from "@consensus-tools/schemas";
import { deepCopy } from "@consensus-tools/core";

export const PLUGIN_ID = "consensus-tools";

export const defaultConfig: ConsensusToolsConfig = {
  mode: "local",
  local: {
    storage: { kind: "json", path: "./.openclaw/consensus-tools.json" },
    server: { enabled: false, host: "127.0.0.1", port: 9888, authToken: "" },
    slashingEnabled: false,
    jobDefaults: {
      reward: 10,
      stakeRequired: 1,
      maxParticipants: 3,
      minParticipants: 1,
      expiresSeconds: 86400,
      consensusPolicy: { type: "FIRST_SUBMISSION_WINS", trustedArbiterAgentId: "", tieBreak: "earliest" },
      slashingPolicy: { enabled: false, slashPercent: 0, slashFlat: 0 },
    },
    consensusPolicies: {
      FIRST_SUBMISSION_WINS: { type: "FIRST_SUBMISSION_WINS" },
      HIGHEST_CONFIDENCE_SINGLE: { type: "HIGHEST_CONFIDENCE_SINGLE", minConfidence: 0 },
      APPROVAL_VOTE: { type: "APPROVAL_VOTE", quorum: 1, minScore: 1, minMargin: 0, tieBreak: "earliest", approvalVote: { weightMode: "equal", settlement: "immediate" } },
      OWNER_PICK: { type: "OWNER_PICK" },
      TOP_K_SPLIT: { type: "TOP_K_SPLIT", topK: 2, ordering: "confidence" },
      MAJORITY_VOTE: { type: "MAJORITY_VOTE" },
      WEIGHTED_VOTE_SIMPLE: { type: "WEIGHTED_VOTE_SIMPLE" },
      WEIGHTED_REPUTATION: { type: "WEIGHTED_REPUTATION" },
      TRUSTED_ARBITER: { type: "TRUSTED_ARBITER", trustedArbiterAgentId: "" },
    },
    ledger: {
      faucetEnabled: false,
      initialCreditsPerAgent: 0,
      balancesMode: "initial",
      balances: {},
    },
  },
  global: { baseUrl: "http://localhost:9888", accessToken: "" },
  agentIdentity: { agentIdSource: "openclaw", manualAgentId: "" },
  safety: { requireOptionalToolsOptIn: true, allowNetworkSideEffects: false },
};

function mergeDefaults<T>(defaults: T, input: Partial<T>): T {
  if (Array.isArray(defaults)) return (Array.isArray(input) ? input : defaults) as T;
  if (defaults && typeof defaults === "object") {
    const output: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(defaults as object), ...Object.keys((input || {}) as object)]);
    for (const key of keys) {
      const defVal = (defaults as Record<string, unknown>)[key];
      const inVal = (input as Record<string, unknown>)?.[key];
      output[key] = inVal === undefined ? deepCopy(defVal) : mergeDefaults(defVal, inVal as Partial<unknown>);
    }
    return output as T;
  }
  return (input === undefined ? defaults : input) as T;
}

function normalizeLegacyPolicyAliases(config: ConsensusToolsConfig): ConsensusToolsConfig {
  const normalized = deepCopy(config);
  const normalize = (value?: string) => (value === "SINGLE_WINNER" ? "FIRST_SUBMISSION_WINS" : value);
  const dp = normalized?.local?.jobDefaults?.consensusPolicy;
  if (dp?.type) (dp as Record<string, unknown>).type = normalize(dp.type);
  const pm = normalized?.local?.consensusPolicies ?? {};
  for (const p of Object.values(pm)) if (p?.type) (p as Record<string, unknown>).type = normalize(p.type);
  return normalized;
}

export function loadConfig(api: unknown, logger?: { warn?: (...args: unknown[]) => void }): ConsensusToolsConfig {
  const fallback = deepCopy(defaultConfig);
  const a = api as Record<string, any>;
  let raw: unknown;
  try { raw = a?.config?.getPluginConfig?.(PLUGIN_ID); } catch (err) {
    logger?.warn?.(`consensus-tools: failed to read config via getPluginConfig: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!raw) try { raw = a?.config?.get?.(`plugins.entries.${PLUGIN_ID}.config`); } catch (err) {
    logger?.warn?.(`consensus-tools: failed to read config via config.get: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!raw) raw = a?.config?.plugins?.entries?.[PLUGIN_ID]?.config;
  if (!raw) raw = a?.config?.entries?.[PLUGIN_ID]?.config;
  return normalizeLegacyPolicyAliases(mergeDefaults(fallback, (raw ?? {}) as Partial<ConsensusToolsConfig>));
}

export function resolveAgentId(api: unknown, config: ConsensusToolsConfig): string {
  const a = api as Record<string, any>;
  if (config.agentIdentity.agentIdSource === "manual" && config.agentIdentity.manualAgentId) return config.agentIdentity.manualAgentId;
  if (config.agentIdentity.agentIdSource === "env") {
    const envId = process.env.OPENCLAW_AGENT_ID || process.env.CONSENSUS_TOOLS_AGENT_ID;
    if (envId) return envId;
  }
  return a?.agentId || a?.identity?.agentId || a?.context?.agentId || config.agentIdentity.manualAgentId || "unknown-agent";
}
