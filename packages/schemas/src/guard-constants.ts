import type { GuardType } from "./guard.js";

// ── Built-in Guard Domains ───────────────────────────────────────────
// Canonical list of guard types supported out of the box.
// These are the core domains evaluated by the built-in evaluator rules.

export const BUILT_IN_GUARD_DOMAINS: GuardType[] = [
  "send_email",
  "code_merge",
  "publish",
  "support_reply",
  "agent_action",
  "deployment",
  "permission_escalation",
];

// ── Guard Domain Descriptions ────────────────────────────────────────
// Human-readable descriptions for each guard domain.
// Used by adapters (LangChain, MCP) to describe tools to LLM agents.

export const GUARD_DOMAIN_DESCRIPTIONS: Record<string, string> = {
  send_email:
    "Evaluate email safety — checks for secrets, PII, and restricted content in outbound emails",
  code_merge:
    "Evaluate code merge safety — flags sensitive files (auth/security/crypto), failing tests, and vulnerability patterns",
  publish:
    "Evaluate content safety — detects profanity, PII patterns, guarantee language, and legal/medical claims",
  support_reply:
    "Evaluate customer support reply — flags escalation language, threats, and safety violations",
  agent_action:
    "Evaluate autonomous agent action — blocks irreversible actions, flags external side effects",
  deployment:
    "Evaluate deployment safety — blocks failed CI, flags missing rollback plans, requires review for production",
  permission_escalation:
    "Evaluate permission change — blocks wildcard permissions, flags break-glass and admin escalations",
};

// ── Default Guard Policy ─────────────────────────────────────────────
// Default policy configuration used when no custom policy is supplied.

export const DEFAULT_GUARD_POLICY = {
  policyId: "default-guard",
  version: "v1",
  quorum: 0.7,
  riskThreshold: 0.7,
  hitlRequiredAboveRisk: 0.7,
  options: {},
} as const;
