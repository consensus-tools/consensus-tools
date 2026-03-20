import type { GuardVote, GuardEvaluateInput } from "@consensus-tools/schemas";
import { detectHardBlockFlags } from "./taxonomy.js";

/**
 * Deterministic guard evaluators — union of inner + outer guard detection rules.
 *
 * Each domain evaluator inspects the action payload and returns votes with risk scores.
 * Rules are the superset of both the original @consensus-tools/guards evaluators
 * and the standalone consensus-*-guard packages.
 */
export function evaluatorVotes(input: GuardEvaluateInput): GuardVote[] {
  const t = input.action.type;
  const p = input.action.payload || {};

  switch (t) {
    case "send_email":
      return evaluateSendEmail(p);
    case "code_merge":
      return evaluateCodeMerge(p);
    case "publish":
      return evaluatePublish(p);
    case "support_reply":
      return evaluateSupportReply(p);
    case "agent_action":
      return evaluateAgentAction(p);
    case "deployment":
      return evaluateDeployment(p);
    case "permission_escalation":
      return evaluatePermissionEscalation(p);
    default:
      return [{ evaluator: "generic", vote: "YES", reason: "No blocking rule matched", risk: 0.2 }];
  }
}

function evaluateSendEmail(p: Record<string, unknown>): GuardVote[] {
  const body = String(p["body"] || "");
  const to = String(p["to"] || "");
  if ((to.includes("@") && p["attachment"]) || /(api[_-]?key|token|password|secret)/i.test(body)) {
    return [{ evaluator: "email-risk", vote: "NO", reason: "External attachment or secrets-like pattern", risk: 0.92 }];
  }
  const flags = detectHardBlockFlags(body);
  if (flags.length > 0) {
    return [{ evaluator: "email-risk", vote: "NO", reason: `Hard-block flags detected: ${flags.join(", ")}`, risk: 0.95 }];
  }
  return [{ evaluator: "email-risk", vote: "YES", reason: "No high-risk signals", risk: 0.2 }];
}

function evaluateCodeMerge(p: Record<string, unknown>): GuardVote[] {
  const files = ((p["files"] as string[]) || []).join(" ");
  const diff = String(p["diff_summary"] || "");
  const testsPassed = p["tests_passed"];
  if (testsPassed === false) {
    return [{ evaluator: "merge-risk", vote: "NO", reason: "Tests failing", risk: 0.9 }];
  }
  if (/sql injection|xss|rce|secret leak/i.test(diff)) {
    return [{ evaluator: "merge-risk", vote: "NO", reason: "Security vulnerability pattern in diff", risk: 0.95 }];
  }
  if (/auth|security|permission|crypto/i.test(files)) {
    return [{ evaluator: "merge-risk", vote: "REWRITE", reason: "Sensitive file touched", risk: 0.82 }];
  }
  return [{ evaluator: "merge-risk", vote: "YES", reason: "No sensitive file touch", risk: 0.25 }];
}

function evaluatePublish(p: Record<string, unknown>): GuardVote[] {
  const text = String(p["text"] || p["body"] || "");
  if (/(damn|shit|fuck)/i.test(text) || /\b\d{3}-\d{2}-\d{4}\b/.test(text)) {
    return [{ evaluator: "publish-risk", vote: "REWRITE", reason: "Profanity or personal-data pattern", risk: 0.75 }];
  }
  const flags = detectHardBlockFlags(text);
  if (flags.length > 0) {
    return [{ evaluator: "publish-risk", vote: "REWRITE", reason: `Content flags detected: ${flags.join(", ")}`, risk: 0.85 }];
  }
  return [{ evaluator: "publish-risk", vote: "YES", reason: "Clean publish text", risk: 0.2 }];
}

function evaluateSupportReply(p: Record<string, unknown>): GuardVote[] {
  const message = String(p["message"] || p["body"] || "");
  if (/(refund|lawsuit|legal action)/i.test(message)) {
    return [{ evaluator: "support-risk", vote: "REWRITE", reason: "Escalation language detected", risk: 0.7 }];
  }
  const flags = detectHardBlockFlags(message);
  if (flags.length > 0) {
    return [{ evaluator: "support-risk", vote: "REWRITE", reason: `Safety flags detected: ${flags.join(", ")}`, risk: 0.8 }];
  }
  return [{ evaluator: "support-risk", vote: "YES", reason: "Standard support reply", risk: 0.15 }];
}

function evaluateAgentAction(p: Record<string, unknown>): GuardVote[] {
  const irreversible = Boolean(p["irreversible"]);
  const highRisk = p["risk_level"] === "high";
  const externalSideEffect = Boolean(p["external_side_effect"]);
  if (irreversible) {
    return [{ evaluator: "agent-risk", vote: "NO", reason: "Irreversible agent action requires review", risk: highRisk ? 0.95 : 0.85 }];
  }
  if (externalSideEffect) {
    return [{ evaluator: "agent-risk", vote: "REWRITE", reason: "External side effect — requires confirmation", risk: 0.6 }];
  }
  return [{ evaluator: "agent-risk", vote: "YES", reason: "Reversible agent action", risk: 0.3 }];
}

function evaluateDeployment(p: Record<string, unknown>): GuardVote[] {
  const env = String(p["env"] || "dev");
  const ciPassed = p["ci_passed"];
  const requiresRollback = Boolean(p["requires_rollback"]);
  const hasRollback = Boolean(p["has_rollback"]);
  if (ciPassed === false) {
    return [{ evaluator: "deploy-risk", vote: "NO", reason: "CI checks failed", risk: 0.95 }];
  }
  if (requiresRollback && !hasRollback) {
    return [{ evaluator: "deploy-risk", vote: "NO", reason: "Missing rollback plan for deployment requiring rollback", risk: 0.9 }];
  }
  if (env === "prod") {
    return [{ evaluator: "deploy-risk", vote: "REWRITE", reason: "Production deployment requires review", risk: 0.8 }];
  }
  return [{ evaluator: "deploy-risk", vote: "YES", reason: "Non-production deployment", risk: 0.2 }];
}

function evaluatePermissionEscalation(p: Record<string, unknown>): GuardVote[] {
  const permission = String(p["permission"] || "");
  const resource = String(p["resource"] || "");
  const breakGlass = Boolean(p["breakGlass"]);
  const targetRole = String(p["target_role"] || "");
  if (permission === "*" || resource === "*") {
    return [{ evaluator: "perm-risk", vote: "NO", reason: "Wildcard permission or resource — too broad", risk: 0.95 }];
  }
  if (breakGlass) {
    return [{ evaluator: "perm-risk", vote: "REWRITE", reason: "Break-glass escalation flagged", risk: 0.9 }];
  }
  if (/admin|superuser|root/i.test(targetRole)) {
    return [{ evaluator: "perm-risk", vote: "REWRITE", reason: "Admin/superuser role escalation", risk: 0.8 }];
  }
  return [{ evaluator: "perm-risk", vote: "YES", reason: "Standard permission change", risk: 0.35 }];
}
