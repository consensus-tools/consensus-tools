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
          },
          required: ['kind', 'path']
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
          required: ['enabled', 'host', 'port', 'authToken']
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
                    'SINGLE_WINNER',
                    'HIGHEST_CONFIDENCE_SINGLE',
                    'OWNER_PICK',
                    'TOP_K_SPLIT',
                    'MAJORITY_VOTE',
                    'WEIGHTED_VOTE_SIMPLE',
                    'WEIGHTED_REPUTATION',
                    'TRUSTED_ARBITER'
                  ],
                  default: 'SINGLE_WINNER'
                },
                trustedArbiterAgentId: { type: 'string', default: '' },
                minConfidence: { type: 'number', default: 0, minimum: 0, maximum: 1 },
                topK: { type: 'integer', default: 2, minimum: 1 },
                ordering: { type: 'string', enum: ['confidence', 'score'], default: 'confidence' },
                quorum: { type: 'integer', minimum: 1 }
              },
              required: ['type', 'trustedArbiterAgentId']
            },
            slashingPolicy: {
              type: 'object',
              additionalProperties: false,
              properties: {
                enabled: { type: 'boolean', default: false },
                slashPercent: { type: 'number', default: 0, minimum: 0, maximum: 1 },
                slashFlat: { type: 'number', default: 0, minimum: 0 }
              },
              required: ['enabled', 'slashPercent', 'slashFlat']
            }
          },
          required: [
            'reward',
            'stakeRequired',
            'maxParticipants',
            'minParticipants',
            'expiresSeconds',
            'consensusPolicy',
            'slashingPolicy'
          ]
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
                  'SINGLE_WINNER',
                  'HIGHEST_CONFIDENCE_SINGLE',
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
              quorum: { type: 'integer', minimum: 1 }
            },
            required: ['type']
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
          required: ['faucetEnabled', 'initialCreditsPerAgent', 'balancesMode', 'balances']
        }
      },
      required: ['storage', 'server', 'slashingEnabled', 'jobDefaults', 'ledger']
    },
    global: {
      type: 'object',
      additionalProperties: false,
      properties: {
        baseUrl: { type: 'string', default: 'http://localhost:9888' },
        accessToken: { type: 'string', default: '' }
      },
      required: ['baseUrl', 'accessToken']
    },
    agentIdentity: {
      type: 'object',
      additionalProperties: false,
      properties: {
        agentIdSource: { type: 'string', enum: ['openclaw', 'env', 'manual'], default: 'openclaw' },
        manualAgentId: { type: 'string', default: '' }
      },
      required: ['agentIdSource', 'manualAgentId']
    },
    safety: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requireOptionalToolsOptIn: { type: 'boolean', default: true },
        allowNetworkSideEffects: { type: 'boolean', default: false }
      },
      required: ['requireOptionalToolsOptIn', 'allowNetworkSideEffects']
    }
  },
  required: ['mode', 'agentIdentity', 'safety'],
  allOf: [
    {
      if: { properties: { mode: { const: 'local' } } },
      then: { required: ['local'] }
    },
    {
      if: { properties: { mode: { const: 'global' } } },
      then: { required: ['global'] }
    }
  ]
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
      consensusPolicy: { type: 'SINGLE_WINNER', trustedArbiterAgentId: '' },
      slashingPolicy: { enabled: false, slashPercent: 0, slashFlat: 0 }
    },
    consensusPolicies: {
      SINGLE_WINNER: { type: 'SINGLE_WINNER' },
      HIGHEST_CONFIDENCE_SINGLE: { type: 'HIGHEST_CONFIDENCE_SINGLE', minConfidence: 0 },
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
    logger?.warn?.({ err }, 'consensus-tools: failed to read config via getPluginConfig');
  }

  if (!raw) {
    try {
      raw = api?.config?.get?.(`plugins.entries.${PLUGIN_ID}.config`);
    } catch (err) {
      logger?.warn?.({ err }, 'consensus-tools: failed to read config via config.get');
    }
  }

  if (!raw) {
    raw = api?.config?.plugins?.entries?.[PLUGIN_ID]?.config;
  }

  if (!raw) {
    raw = api?.config?.entries?.[PLUGIN_ID]?.config;
  }

  return mergeDefaults(fallback, raw ?? {});
}

export function validateConfig(input: ConsensusToolsConfig, logger?: any): { config: ConsensusToolsConfig; errors: string[] } {
  const candidate = deepCopy(input);
  const ok = validate(candidate);
  const errors = ok
    ? []
    : (validate.errors || []).map((err) => `${err.instancePath || '/'} ${err.message || 'invalid'}`);

  if (!ok) {
    logger?.warn?.({ errors }, 'consensus-tools: config validation warnings');
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
