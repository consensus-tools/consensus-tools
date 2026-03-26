import type { GuardEvaluateInput, GuardPolicy } from "@consensus-tools/schemas";
import type { IStorage } from "@consensus-tools/storage";
import type { GuardEngine } from "@consensus-tools/core";

// ── Guard Policy Matrix (ported from legacy tools/registry.ts) ────────

const GUARD_POLICY_MATRIX: Record<string, unknown> = {
  send_email: {
    quorum: 0.7, hitlRequiredAboveRisk: 0.75,
    options: { tone: ["neutral", "formal"], externalRecipients: ["allow", "require_hitl"] },
    guardSettings: {
      recipientAllowlist: { type: "string", description: "Comma-separated allowed email domains", default: "" },
      recipientBlocklist: { type: "string", description: "Comma-separated blocked email domains", default: "" },
      attachmentPolicy: { type: "enum", values: ["allow", "warn", "block"], default: "warn", description: "How to handle email attachments" },
      secretsScanning: { type: "boolean", default: true, description: "Scan body for API keys, tokens, secrets" },
    },
  },
  code_merge: {
    quorum: 0.7, hitlRequiredAboveRisk: 0.7,
    options: { strictness: ["balanced", "strict"], requireCi: [true, false] },
    guardSettings: {
      sensitiveFilePatterns: { type: "string", description: "Comma-separated file path patterns triggering elevated risk", default: "auth,security,permission,crypto" },
      requiredReviewers: { type: "number", min: 0, max: 10, default: 1, description: "Minimum human code reviewers" },
      protectedBranches: { type: "string", description: "Comma-separated branch patterns requiring stricter review", default: "main" },
      ciRequired: { type: "boolean", default: true, description: "Require CI checks to pass" },
    },
  },
  publish: {
    quorum: 0.7, hitlRequiredAboveRisk: 0.7,
    options: { channel: ["blog", "social"], legalReview: [true, false] },
    guardSettings: {
      profanityFilter: { type: "boolean", default: true, description: "Scan for profanity" },
      piiDetection: { type: "boolean", default: true, description: "Detect PII patterns (SSN, etc.)" },
      blockedWords: { type: "string", description: "Comma-separated custom blocked words", default: "" },
    },
  },
  support_reply: {
    quorum: 0.7, hitlRequiredAboveRisk: 0.7,
    options: { customerTier: ["free", "pro", "enterprise"] },
    guardSettings: {
      escalationKeywords: { type: "string", description: "Comma-separated keywords triggering escalation", default: "refund,lawsuit,legal action" },
      autoEscalate: { type: "boolean", default: true, description: "Auto-escalate to human on keyword match" },
      customerTier: { type: "enum", values: ["all", "free", "pro", "enterprise"], default: "all", description: "Customer tier for risk weighting" },
    },
  },
  agent_action: {
    quorum: 0.7, hitlRequiredAboveRisk: 0.7,
    options: { irreversible: [true, false] },
    guardSettings: {
      irreversibleDefault: { type: "boolean", default: false, description: "Treat actions as irreversible by default" },
      toolAllowlist: { type: "string", description: "Comma-separated MCP tool names allowed without review", default: "" },
      toolBlocklist: { type: "string", description: "Comma-separated MCP tool names always requiring review", default: "" },
    },
  },
  deployment: {
    quorum: 0.7, hitlRequiredAboveRisk: 0.8,
    options: { env: ["dev", "staging", "prod"], rollout: ["canary", "all-at-once"] },
    guardSettings: {
      deployEnv: { type: "enum", values: ["dev", "staging", "prod"], default: "prod", description: "Target deployment environment" },
      rolloutStrategy: { type: "enum", values: ["canary", "blue-green", "rolling", "all-at-once"], default: "all-at-once", description: "Rollout strategy" },
      requireProdApproval: { type: "boolean", default: true, description: "Require human approval for prod deploys" },
      rollbackEnabled: { type: "boolean", default: true, description: "Enable automatic rollback on failure" },
    },
  },
  permission_escalation: {
    quorum: 0.75, hitlRequiredAboveRisk: 0.75,
    options: { environment: ["dev", "staging", "prod"], breakGlass: [true, false] },
    guardSettings: {
      breakGlassDefault: { type: "boolean", default: false, description: "Treat escalations as break-glass by default" },
      maxEscalationLevel: { type: "number", min: 1, max: 5, default: 3, description: "Maximum escalation levels" },
      requireMfa: { type: "boolean", default: false, description: "Require MFA for approval" },
      permEnv: { type: "enum", values: ["dev", "staging", "prod"], default: "prod", description: "Target environment" },
    },
  },
};

// ── Tool Registry ─────────────────────────────────────────────────────

export interface ToolRegistryDeps {
  storage: IStorage;
  guardEngine?: GuardEngine;
}

export class ToolRegistry {
  private readonly storage: IStorage;
  private readonly guardEngine?: GuardEngine;

  constructor(deps: ToolRegistryDeps) {
    this.storage = deps.storage;
    this.guardEngine = deps.guardEngine;
  }

  listToolNames(): string[] {
    return [
      "guard.evaluate", "guard.send_email", "guard.code_merge", "guard.publish",
      "guard.support_reply", "guard.agent_action", "guard.deployment", "guard.permission_escalation",
      "guard.policy.describe",
      "persona.generate", "persona.respawn",
      "board.list", "board.get", "run.get", "audit.search",
      "human.approve",
    ];
  }

  async invoke(name: string, input: Record<string, unknown>): Promise<unknown> {
    // Guard tools
    if (name.startsWith("guard.") && name !== "guard.policy.describe") {
      if (!this.guardEngine) throw new Error("Guard engine not configured");
      const guardType = name === "guard.evaluate"
        ? (input as GuardEvaluateInput).action?.type ?? "agent_action"
        : name.replace("guard.", "");
      const evalInput: GuardEvaluateInput = {
        boardId: (input as Record<string, string>).boardId ?? "default",
        agentId: (input as Record<string, string>).agentId ?? "unknown",
        action: (input as GuardEvaluateInput).action ?? { type: guardType, payload: input },
      };
      return this.guardEngine.evaluate(evalInput, (input as Record<string, unknown>).policy as GuardPolicy | undefined);
    }

    // Guard policy describe
    if (name === "guard.policy.describe") {
      const guardType = input.guardType as string | undefined;
      return guardType
        ? { guardType, policy: GUARD_POLICY_MATRIX[guardType] ?? null }
        : { guards: GUARD_POLICY_MATRIX };
    }

    // Persona tools
    if (name === "persona.generate") {
      const boardName = (input.boardName as string) ?? "default";
      const personaCount = Math.min(25, Math.max(1, Number(input.personaCount) || 5));
      const PERSONA_NAMES = ["Auditor", "Advocate", "Skeptic", "Analyst", "Ethicist", "Pragmatist", "Innovator", "Guardian", "Mediator", "Challenger"];
      return {
        board: { id: boardName, name: boardName },
        personas: Array.from({ length: personaCount }, (_, i) => ({
          id: `p-${i + 1}`,
          name: PERSONA_NAMES[i % PERSONA_NAMES.length],
          weight: 1,
          reputation: 50,
        })),
      };
    }
    if (name === "persona.respawn") {
      return { status: "PENDING", message: "Persona respawn queued", boardId: input.boardId, replaced: input.personaId ?? null };
    }

    // Board/run/audit tools — delegate to storage
    if (name === "board.list") {
      const state = await this.storage.getState();
      const boardIds = new Set<string>();
      for (const j of state.jobs) { if (j.boardId) boardIds.add(j.boardId); }
      for (const e of state.audit) {
        const bid = (e.details as Record<string, unknown>)?.boardId as string | undefined;
        if (bid) boardIds.add(bid);
      }
      return { boards: [...boardIds].map((id) => ({ id })) };
    }
    if (name === "board.get") {
      const state = await this.storage.getState();
      const boardId = input.id as string;
      const jobs = state.jobs.filter((j) => j.boardId === boardId);
      const participants = state.participants?.filter((p) => p.boardId === boardId) ?? [];
      const runs = state.workflowRuns?.filter((r) =>
        state.workflows?.some((w) => w.id === r.workflowId && (w.definition as Record<string, unknown>)?.boardId === boardId),
      ) ?? [];
      return { board: { id: boardId, jobs: jobs.length, participants: participants.length, runs: runs.length }, jobs, participants, runs };
    }
    if (name === "run.get") {
      const state = await this.storage.getState();
      const runId = input.id as string;
      const job = state.jobs.find((j) => j.id === runId);
      const events = state.audit.filter((e) =>
        (e.details as Record<string, unknown>)?.runId === runId,
      );
      return { run: job ?? null, events };
    }
    if (name === "audit.search") {
      const state = await this.storage.getState();
      const query = (input.query as string) ?? "";
      const limit = Math.min(500, Number(input.limit) || 100);
      const results = query
        ? state.audit.filter((e) => JSON.stringify(e).toLowerCase().includes(query.toLowerCase()))
        : state.audit;
      return { events: results.slice(-limit) };
    }

    if (name === "human.approve") {
      // Delegate to the existing human.approve handler in server
      throw new Error("Use POST /api/human.approve endpoint directly");
    }

    throw new Error(`Unknown tool: ${name}`);
  }
}
