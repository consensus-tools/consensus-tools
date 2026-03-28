import type { RiskTier, RiskTierMap } from "./types.js";

// ── Default Risk Classification ──────────────────────────────────────
// Tools are classified by name prefix/pattern. Write/send/delete/mutate
// operations get full LLM deliberation. Read-only operations fast-path
// through regex only.
//
// Users override via config.riskTiers: { "my_tool": "low" }

const HIGH_RISK_PATTERNS = [
  /^(send|email|mail)/i,
  /^(delete|remove|drop|destroy)/i,
  /^(write|update|patch|put|post|create|insert)/i,
  /^(deploy|release|publish|push)/i,
  /^(merge|commit|approve)/i,
  /^(grant|revoke|escalate|permission)/i,
  /^(execute|run|eval|exec)/i,
  /^(transfer|pay|charge|refund)/i,
];

const LOW_RISK_PATTERNS = [
  /^(get|fetch|read|list|search|query|find|lookup)/i,
  /^(check|verify|validate|inspect|describe)/i,
  /^(count|sum|aggregate|stats)/i,
  /^(view|show|display|render|preview)/i,
];

/**
 * Classify a tool name into a risk tier.
 *
 * Priority: user overrides > high-risk patterns > low-risk patterns > default high.
 * High-risk checked FIRST to prevent bypass via naming (e.g., "get_and_delete_user").
 * Unknown tools default to high-risk (safe by default).
 */
export function classifyTool(toolName: string, overrides?: RiskTierMap): RiskTier {
  if (overrides?.[toolName]) {
    return overrides[toolName];
  }

  // Check high-risk FIRST to prevent bypass via compound names
  for (const pattern of HIGH_RISK_PATTERNS) {
    if (pattern.test(toolName)) return "high";
  }

  for (const pattern of LOW_RISK_PATTERNS) {
    if (pattern.test(toolName)) return "low";
  }

  // Unknown tools default to high-risk (safe by default)
  return "high";
}
