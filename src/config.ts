import Ajv from 'ajv';
import { deepCopy } from './util/ids';
import type { ConsensusToolsConfig } from './types';

export const PLUGIN_ID = 'consensus-tools';

export const configSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: { type: 'string', enum: ['local', 'global'], default: 'local' },
    local: {
      type: 'object',
      additionalProperties: false,
      properties: {
        storage: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['sqlite', 'json'], default: 'json' },
            path: { type: 'string', default: './.openclaw/consensus-tools.json' }
          }
        },
        server: {
          type: 'object',
          additionalProperties: false,
          properties: {
            enabled: { type: 'boolean', default: false },
            host: { type: 'string', default: '127.0.0.1' },
            port: { type: 'integer', default: 9888, minimum: 1, maximum: 65535 },
            authToken: { type: 'string', default: '' }
          },
        },
        slashingEnabled: { type: 'boolean', default: false },
        jobDefaults: {
          type: 'object',
          additionalProperties: false,
          properties: {
            reward: { type: 'number', default: 10, minimum: 0 },
            stakeRequired: { type: 'number', default: 1, minimum: 0 },
            maxParticipants: { type: 'integer', default: 3, minimum: 1 },
            minParticipants: { type: 'integer', default: 1, minimum: 1 },
            expiresSeconds: { type: 'integer', default: 86400, minimum: 60 },
            consensusPolicy: {
              type: 'object',
              additionalProperties: false,
              properties: {
                type: {
                  type: 'string',
                  enum: [
                    'FIRST_SUBMISSION_WINS',
                    'SINGLE_WINNER',
                    'HIGHEST_CONFIDENCE_SINGLE',
                    'APPROVAL_VOTE',
                    'OWNER_PICK',
                    'TOP_K_SPLIT',
                    'MAJORITY_VOTE',
                    'WEIGHTED_VOTE_SIMPLE',
                    'WEIGHTED_REPUTATION',
                    'TRUSTED_ARBITER'
                  ],
                  default: 'FIRST_SUBMISSION_WINS'
                },
                trustedArbiterAgentId: { type: 'string', default: '' },
                minConfidence: { type: 'number', default: 0, minimum: 0, maximum: 1 },
                topK: { type: 'integer', default: 2, minimum: 1 },
                ordering: { type: 'string', enum: ['confidence', 'score'], default: 'confidence' },
                quorum: { type: 'integer', minimum: 1 },
                minScore: { type: 'number' },
                minMargin: { type: 'number' },
                tieBreak: { type: 'string', enum: ['earliest', 'confidence', 'arbiter'] },
                approvalVote: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    weightMode: { type: 'string', enum: ['equal', 'explicit', 'reputation'] },
                    settlement: { type: 'string', enum: ['immediate', 'staked', 'oracle'] },
                    oracle: { type: 'string', enum: ['trusted_arbiter'] },
                    voteSlashPercent: { type: 'number', minimum: 0, maximum: 1 }
                  }
                }
              },
            },
            slashingPolicy: {
              type: 'object',
              additionalProperties: false,
              properties: {
                enabled: { type: 'boolean', default: false },
                slashPercent: { type: 'number', default: 0, minimum: 0, maximum: 1 },
                slashFlat: { type: 'number', default: 0, minimum: 0 }
              },
            }
          },
        },
        consensusPolicies: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            additionalProperties: false,
            properties: {
              type: {
                type: 'string',
                enum: [
                  'FIRST_SUBMISSION_WINS',
                  'SINGLE_WINNER',
                  'HIGHEST_CONFIDENCE_SINGLE',
                  'APPROVAL_VOTE',
                  'OWNER_PICK',
                  'TOP_K_SPLIT',
                  'MAJORITY_VOTE',
                  'WEIGHTED_VOTE_SIMPLE',
                  'WEIGHTED_REPUTATION',
                  'TRUSTED_ARBITER'
                ]
              },
              trustedArbiterAgentId: { type: 'string' },
              minConfidence: { type: 'number', minimum: 0, maximum: 1 },
              topK: { type: 'integer', minimum: 1 },
              ordering: { type: 'string', enum: ['confidence', 'score'] },
              quorum: { type: 'integer', minimum: 1 },
              minScore: { type: 'number' },
              minMargin: { type: 'number' },
              tieBreak: { type: 'string', enum: ['earliest', 'confidence', 'arbiter'] },
              approvalVote: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  weightMode: { type: 'string', enum: ['equal', 'explicit', 'reputation'] },
                  settlement: { type: 'string', enum: ['immediate', 'staked', 'oracle'] },
                  oracle: { type: 'string', enum: ['trusted_arbiter'] },
                  voteSlashPercent: { type: 'number', minimum: 0, maximum: 1 }
                }
              }
            },
          },
          default: {}
        },
        ledger: {
          type: 'object',
          additionalProperties: false,
          properties: {
            faucetEnabled: { type: 'boolean', default: false },
            initialCreditsPerAgent: { type: 'number', default: 0, minimum: 0 },
            balancesMode: { type: 'string', enum: ['initial', 'override'], default: 'initial' },
            balances: {
              type: 'object',
              additionalProperties: { type: 'number', minimum: 0 },
              default: {}
            }
          },
        }
      },
    },
    global: {
      type: 'object',
      additionalProperties: false,
      properties: {
        baseUrl: { type: 'string', default: 'http://localhost:9888' },
        accessToken: { type: 'string', default: '' }
      },
    },
    agentIdentity: {
      type: 'object',
      additionalProperties: false,
      properties: {
        agentIdSource: { type: 'string', enum: ['openclaw', 'env', 'manual'], default: 'openclaw' },
        manualAgentId: { type: 'string', default: '' }
      },
    },
    safety: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requireOptionalToolsOptIn: { type: 'boolean', default: true },
        allowNetworkSideEffects: { type: 'boolean', default: false }
      },
    }
  },
} as const;

export const defaultConfig: ConsensusToolsConfig = {
  mode: 'local',
  local: {
    storage: { kind: 'json', path: './.openclaw/consensus-tools.json' },
    server: { enabled: false, host: '127.0.0.1', port: 9888, authToken: '' },
    slashingEnabled: false,
    jobDefaults: {
      reward: 10,
      stakeRequired: 1,
      maxParticipants: 3,
      minParticipants: 1,
      expiresSeconds: 86400,
      consensusPolicy: { type: 'FIRST_SUBMISSION_WINS', trustedArbiterAgentId: '', tieBreak: 'earliest' },
      slashingPolicy: { enabled: false, slashPercent: 0, slashFlat: 0 }
    },
    consensusPolicies: {
      FIRST_SUBMISSION_WINS: { type: 'FIRST_SUBMISSION_WINS' },
      HIGHEST_CONFIDENCE_SINGLE: { type: 'HIGHEST_CONFIDENCE_SINGLE', minConfidence: 0 },
      APPROVAL_VOTE: { type: 'APPROVAL_VOTE', quorum: 1, minScore: 1, minMargin: 0, tieBreak: 'earliest', approvalVote: { weightMode: 'equal', settlement: 'immediate' } },
      OWNER_PICK: { type: 'OWNER_PICK' },
      TOP_K_SPLIT: { type: 'TOP_K_SPLIT', topK: 2, ordering: 'confidence' },
      MAJORITY_VOTE: { type: 'MAJORITY_VOTE' },
      WEIGHTED_VOTE_SIMPLE: { type: 'WEIGHTED_VOTE_SIMPLE' },
      WEIGHTED_REPUTATION: { type: 'WEIGHTED_REPUTATION' },
      TRUSTED_ARBITER: { type: 'TRUSTED_ARBITER', trustedArbiterAgentId: '' }
    },
    ledger: {
      faucetEnabled: false,
      initialCreditsPerAgent: 0,
      balancesMode: 'initial',
      balances: {}
    }
  },
  global: {
    baseUrl: 'http://localhost:9888',
    accessToken: ''
  },
  agentIdentity: { agentIdSource: 'openclaw', manualAgentId: '' },
  safety: {
    requireOptionalToolsOptIn: true,
    allowNetworkSideEffects: false
  }
};

const ajv = new Ajv({ allErrors: true, useDefaults: true, removeAdditional: false });
const validate = ajv.compile(configSchema);

export function loadConfig(api: any, logger?: any): ConsensusToolsConfig {
  const fallback = deepCopy(defaultConfig);
  let raw: any = undefined;

  try {
    raw = api?.config?.getPluginConfig?.(PLUGIN_ID);
  } catch (err) {
    logger?.warn?.(`consensus-tools: failed to read config via getPluginConfig: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!raw) {
    try {
      raw = api?.config?.get?.(`plugins.entries.${PLUGIN_ID}.config`);
    } catch (err) {
      logger?.warn?.(`consensus-tools: failed to read config via config.get: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!raw) {
    raw = api?.config?.plugins?.entries?.[PLUGIN_ID]?.config;
  }

  if (!raw) {
    raw = api?.config?.entries?.[PLUGIN_ID]?.config;
  }

  return normalizeLegacyPolicyAliases(mergeDefaults(fallback, raw ?? {}));
}

function normalizeLegacyPolicyAliases(config: ConsensusToolsConfig): ConsensusToolsConfig {
  const normalized = deepCopy(config);

  const normalizePolicyType = (value?: string) => {
    if (value === 'SINGLE_WINNER') return 'FIRST_SUBMISSION_WINS';
    return value;
  };

  const defaultsPolicy = normalized?.local?.jobDefaults?.consensusPolicy;
  if (defaultsPolicy?.type) {
    defaultsPolicy.type = normalizePolicyType(defaultsPolicy.type) as any;
  }

  const policyMap = normalized?.local?.consensusPolicies ?? {};
  for (const policy of Object.values(policyMap)) {
    if (policy?.type) {
      policy.type = normalizePolicyType(policy.type) as any;
    }
  }

  return normalized;
}

export function validateConfig(input: ConsensusToolsConfig, logger?: any): { config: ConsensusToolsConfig; errors: string[] } {
  const candidate = deepCopy(input);
  const ok = validate(candidate);
  const errors = ok
    ? []
    : (validate.errors || []).map((err) => `${err.instancePath || '/'} ${err.message || 'invalid'}`);

  if (!ok) {
    logger?.warn?.(`consensus-tools: config validation warnings: ${JSON.stringify(errors)}`);
  }

  return { config: candidate, errors };
}

export function mergeDefaults<T>(defaults: T, input: Partial<T>): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(input) ? input : defaults) as T;
  }
  if (defaults && typeof defaults === 'object') {
    const output: any = {};
    const keys = new Set([...Object.keys(defaults as object), ...Object.keys((input || {}) as object)]);
    for (const key of keys) {
      const defVal: any = (defaults as any)[key];
      const inVal: any = (input as any)?.[key];
      if (inVal === undefined) {
        output[key] = deepCopy(defVal);
      } else {
        output[key] = mergeDefaults(defVal, inVal);
      }
    }
    return output as T;
  }
  return (input === undefined ? defaults : input) as T;
}

export function resolveAgentId(api: any, config: ConsensusToolsConfig): string {
  if (config.agentIdentity.agentIdSource === 'manual' && config.agentIdentity.manualAgentId) {
    return config.agentIdentity.manualAgentId;
  }
  if (config.agentIdentity.agentIdSource === 'env') {
    const envId = process.env.OPENCLAW_AGENT_ID || process.env.CONSENSUS_TOOLS_AGENT_ID;
    if (envId) return envId;
  }
  return (
    api?.agentId ||
    api?.identity?.agentId ||
    api?.context?.agentId ||
    config.agentIdentity.manualAgentId ||
    'unknown-agent'
  );
}
