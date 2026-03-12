import { z } from "zod";
import { consensusPolicyConfigSchema, slashingPolicySchema } from "./policy.js";

// ── Config Schema ───────────────────────────────────────────────────
// Shared configuration shape. Loading/resolution logic is adapter-specific.

export const consensusToolsConfigSchema = z.object({
  mode: z.enum(["local", "global"]),
  local: z.object({
    storage: z.object({
      kind: z.enum(["sqlite", "json"]),
      path: z.string(),
    }),
    server: z.object({
      enabled: z.boolean(),
      host: z.string(),
      port: z.number(),
      authToken: z.string(),
      corsOrigins: z.union([z.string(), z.array(z.string())]).optional(),
      rateLimit: z.object({
        enabled: z.boolean(),
        windowMs: z.number(),
        maxRequests: z.number(),
      }).optional(),
    }),
    slashingEnabled: z.boolean(),
    jobDefaults: z.object({
      reward: z.number(),
      stakeRequired: z.number(),
      maxParticipants: z.number(),
      minParticipants: z.number(),
      expiresSeconds: z.number(),
      consensusPolicy: consensusPolicyConfigSchema,
      slashingPolicy: slashingPolicySchema,
    }),
    consensusPolicies: z.record(consensusPolicyConfigSchema).optional(),
    ledger: z.object({
      faucetEnabled: z.boolean(),
      initialCreditsPerAgent: z.number(),
      balances: z.record(z.number()),
      balancesMode: z.enum(["initial", "override"]).optional(),
    }),
  }),
  global: z.object({
    baseUrl: z.string(),
    accessToken: z.string(),
  }),
  agentIdentity: z.object({
    agentIdSource: z.enum(["openclaw", "env", "manual"]),
    manualAgentId: z.string(),
  }),
  safety: z.object({
    requireOptionalToolsOptIn: z.boolean(),
    allowNetworkSideEffects: z.boolean(),
  }),
});
export type ConsensusToolsConfig = z.infer<typeof consensusToolsConfigSchema>;
