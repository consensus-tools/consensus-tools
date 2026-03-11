import { z } from "zod";

// ── Agent ───────────────────────────────────────────────────────────

export const agentKindSchema = z.enum(["internal", "external"]);
export type AgentKind = z.infer<typeof agentKindSchema>;

export const agentStatusSchema = z.enum(["active", "suspended"]);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: agentKindSchema,
  scopes: z.array(z.string()),
  apiKeyHash: z.string().nullable(),
  status: agentStatusSchema,
  metadata: z.record(z.unknown()),
  createdAt: z.string(),
});
export type Agent = z.infer<typeof agentSchema>;

export const agentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: agentKindSchema,
  scopes: z.array(z.string()),
  apiKeyHash: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type AgentConfig = z.infer<typeof agentConfigSchema>;
