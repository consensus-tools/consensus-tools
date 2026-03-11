import type { GuardVote, GuardEvaluateInput } from "@consensus-tools/schemas";

/**
 * Deterministic guard evaluators. Each evaluator inspects the action payload
 * and returns one or more votes with a risk score.
 */
export function evaluatorVotes(input: GuardEvaluateInput): GuardVote[] {
  const t = input.action.type;
  const p = input.action.payload || {};

  if (t === "send_email") {
    const body = String(p["body"] || "");
    const to = String(p["to"] || "");
    if ((to.includes("@") && p["attachment"]) || /(api[_-]?key|token|password|secret)/i.test(body)) {
      return [{ evaluator: "email-risk", vote: "NO", reason: "External attachment or secrets-like pattern", risk: 0.92 }];
    }
    return [{ evaluator: "email-risk", vote: "YES", reason: "No high-risk signals", risk: 0.2 }];
  }

  if (t === "code_merge") {
    const files = ((p["files"] as string[]) || []).join(" ");
    if (/auth|security|permission|crypto/i.test(files)) {
      return [{ evaluator: "merge-risk", vote: "REWRITE", reason: "Sensitive file touched", risk: 0.82 }];
    }
    return [{ evaluator: "merge-risk", vote: "YES", reason: "No sensitive file touch", risk: 0.25 }];
  }

  if (t === "publish") {
    const text = String(p["text"] || "");
    if (/(damn|shit|fuck)/i.test(text) || /\b\d{3}-\d{2}-\d{4}\b/.test(text)) {
      return [{ evaluator: "publish-risk", vote: "REWRITE", reason: "Profanity or personal-data pattern", risk: 0.75 }];
    }
    return [{ evaluator: "publish-risk", vote: "YES", reason: "Clean publish text", risk: 0.2 }];
  }

  if (t === "support_reply") {
    const message = String(p["message"] || "");
    if (/(refund|lawsuit|legal action)/i.test(message)) {
      return [{ evaluator: "support-risk", vote: "REWRITE", reason: "Escalation language detected", risk: 0.7 }];
    }
    return [{ evaluator: "support-risk", vote: "YES", reason: "Standard support reply", risk: 0.15 }];
  }

  if (t === "agent_action") {
    const irreversible = Boolean(p["irreversible"]);
    if (irreversible) {
      return [{ evaluator: "agent-risk", vote: "NO", reason: "Irreversible agent action requires review", risk: 0.85 }];
    }
    return [{ evaluator: "agent-risk", vote: "YES", reason: "Reversible agent action", risk: 0.3 }];
  }

  if (t === "deployment") {
    const env = String(p["env"] || "dev");
    if (env === "prod") {
      return [{ evaluator: "deploy-risk", vote: "REWRITE", reason: "Production deployment requires review", risk: 0.8 }];
    }
    return [{ evaluator: "deploy-risk", vote: "YES", reason: "Non-production deployment", risk: 0.2 }];
  }

  if (t === "permission_escalation") {
    const breakGlass = Boolean(p["breakGlass"]);
    if (breakGlass) {
      return [{ evaluator: "perm-risk", vote: "REWRITE", reason: "Break-glass escalation flagged", risk: 0.9 }];
    }
    return [{ evaluator: "perm-risk", vote: "YES", reason: "Standard permission change", risk: 0.35 }];
  }

  return [{ evaluator: "generic", vote: "YES", reason: "No blocking rule matched", risk: 0.2 }];
}
