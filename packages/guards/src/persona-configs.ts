import type { GuardTemplateConfig } from "./templates.js";

// ── Helper: recursively extract all strings from a value ─────────────

export function extractStrings(obj: unknown): string {
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map(extractStrings).join(" ");
  if (obj && typeof obj === "object") return Object.values(obj).map(extractStrings).join(" ");
  return String(obj);
}

// ── Guard rule factories keyed by persona domain ─────────────────────

export const GUARD_CONFIGS: Record<string, GuardTemplateConfig> = {
  security: {
    description: "Security reviewer — flags dangerous operations, secret exposure, and injection risks",
    rules: (payload) => {
      const text = extractStrings(payload);
      if (/\b(delete|drop|truncate|rm\s+-rf)\b/i.test(text)) {
        return [{ evaluator: "security", vote: "NO", reason: "Destructive operation detected", risk: 0.9 }];
      }
      if (/\b(password|secret|token|api[_-]?key)\b/i.test(text)) {
        return [{ evaluator: "security", vote: "REWRITE", reason: "Potential secret exposure", risk: 0.7 }];
      }
      return [{ evaluator: "security", vote: "YES", reason: "No security concerns", risk: 0.1 }];
    },
    hardBlockPatterns: [
      /\bexec\s*\(\s*['"].*rm\s+-rf/i,
      /\bchild_process\b/i,
      /\b(execSync|spawnSync|spawn|fork)\s*\(/i,
      /\beval\s*\(/,
      /\bFunction\s*\(/,
      /import\s*\(\s*['"]child_process['"]\s*\)/,
    ],
  },
  compliance: {
    description: "Compliance reviewer — flags PII, regulated data, and policy violations",
    rules: (payload) => {
      const text = extractStrings(payload);
      if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) {
        return [{ evaluator: "compliance", vote: "NO", reason: "SSN pattern detected", risk: 0.95 }];
      }
      if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text)) {
        return [{ evaluator: "compliance", vote: "REWRITE", reason: "Email PII detected", risk: 0.5 }];
      }
      return [{ evaluator: "compliance", vote: "YES", reason: "No compliance concerns", risk: 0.1 }];
    },
  },
  "user-impact": {
    description: "User-impact reviewer — flags irreversible actions and high blast-radius operations",
    rules: (payload) => {
      const text = extractStrings(payload);
      if (/\b(broadcast|mass[_-]?(email|notify|delete))\b/i.test(text)) {
        return [{ evaluator: "user-impact", vote: "NO", reason: "Mass operation affects many users", risk: 0.85 }];
      }
      if (/\b(irreversible|permanent|cannot\s+undo)\b/i.test(text)) {
        return [{ evaluator: "user-impact", vote: "REWRITE", reason: "Irreversible action flagged", risk: 0.6 }];
      }
      return [{ evaluator: "user-impact", vote: "YES", reason: "Low user impact", risk: 0.1 }];
    },
  },
};

// ── Default persona trio ─────────────────────────────────────────────

/** The three default reviewer perspectives used when no guards are specified. */
export const DEFAULT_PERSONA_TRIO = ["security", "compliance", "user-impact"] as const;
