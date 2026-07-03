import { randomUUID } from "node:crypto";
import {
  guardEvaluateInputSchema as guardInputZod,
  policyAssignmentSchema,
  DEFAULT_GUARD_POLICY,
  DEFAULT_HITL_TIMEOUT_SEC,
  BUILT_IN_GUARD_DOMAINS,
} from "@consensus-tools/schemas";
import type { GuardPolicy } from "@consensus-tools/schemas";
import type { McpContext } from "../context.js";

const guardEvaluateInputSchema = {
  type: "object" as const,
  properties: {
    boardId: { type: "string", description: "Board ID for this evaluation" },
    runId: { type: "string", description: "Optional run ID for idempotency" },
    agentId: { type: "string", description: "Agent requesting the action" },
    action: {
      type: "object",
      description: "The action to evaluate",
      properties: {
        type: { type: "string", description: "Action type (guard type)" },
        payload: { type: "object", description: "Action-specific payload" },
      },
      required: ["type", "payload"],
    },
    policyPack: { type: "string", description: "Optional policy pack override" },
  },
  required: ["boardId", "action"],
};

// ── Policy Assignment Tools ────────────────────────────────────────

const policyTools = [
  {
    name: "policy.assign",
    description:
      "Assign a guard policy to a board. Upserts — if a policy is already assigned to the board, it is replaced. Once assigned, guard.* evaluations on this board honor the policy: hitlRequiredAboveRisk routes high-risk actions to human review, while quorum/riskThreshold/weightingMode apply to multi-agent weighted decisions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: { type: "string", description: "Board ID to assign policy to" },
        policyId: { type: "string", description: "Policy ID to assign" },
        participants: {
          type: "array",
          description: "Participant IDs included in this policy",
          items: { type: "string" },
        },
        weightingMode: {
          type: "string",
          enum: ["static", "reputation", "hybrid"],
          description: "Vote weighting mode (default: hybrid)",
        },
        quorum: { type: "number", description: "Quorum threshold 0-1" },
        riskThreshold: {
          type: "number",
          description: "Optional 0-1 risk threshold for weighted decisions on this board (default: 0.7)",
        },
        hitlRequiredAboveRisk: {
          type: "number",
          description: "Optional 0-1 risk at or above which actions on this board route to human review (default: 0.7)",
        },
      },
      required: ["boardId", "policyId", "participants", "quorum"],
    },
  },
  {
    name: "policy.list",
    description: "List all policy assignments, optionally filtered by board ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: { type: "string", description: "Optional board ID to filter by" },
      },
    },
  },
];

function makeGuardTool(
  name: string,
  description: string,
  payloadProperties: Record<string, unknown>,
) {
  return {
    name,
    description,
    inputSchema: {
      type: "object" as const,
      properties: {
        boardId: { type: "string", description: "Board ID for this evaluation" },
        runId: { type: "string", description: "Optional run ID for idempotency" },
        agentId: { type: "string", description: "Agent requesting the action" },
        action: {
          type: "object",
          description: "The action to evaluate",
          properties: {
            type: { type: "string", description: "Action type (guard type)" },
            payload: {
              type: "object",
              description: "Action-specific payload",
              properties: payloadProperties,
            },
          },
          required: ["type", "payload"],
        },
        policyPack: { type: "string", description: "Optional policy pack override" },
      },
      required: ["boardId", "action"],
    },
  };
}

export const tools = [
  ...policyTools,
  {
    name: "guard.evaluate",
    description:
      "Evaluate any action against guard policies. Use this when the action type is dynamic or unknown at call time.",
    inputSchema: guardEvaluateInputSchema,
  },
  makeGuardTool(
    "guard.send_email",
    "Evaluate an outbound email before sending. Blocks emails containing secrets, credentials, or external attachments that match risk patterns.",
    {
      to: { type: "string", description: "Recipient email address" },
      subject: { type: "string", description: "Email subject line" },
      body: { type: "string", description: "Email body content" },
      attachments: {
        type: "array",
        description: "List of attachment filenames",
        items: { type: "string" },
      },
      recipientAllowlist: { type: "string", description: "Comma-separated allowed email domains" },
      recipientBlocklist: { type: "string", description: "Comma-separated blocked email domains" },
      attachmentPolicy: {
        type: "string",
        enum: ["allow", "warn", "block"],
        description: "How to handle email attachments",
      },
      secretsScanning: { type: "boolean", description: "Scan body for API keys, tokens, secrets" },
    },
  ),
  makeGuardTool(
    "guard.code_merge",
    "Evaluate a code merge or PR before it lands. Flags changes to auth, security, crypto, or permission files and routes them to human review.",
    {
      repo: { type: "string", description: "Repository name" },
      branch: { type: "string", description: "Target branch" },
      filesChanged: {
        type: "array",
        description: "List of changed file paths",
        items: { type: "string" },
      },
      diff: { type: "string", description: "Diff content or summary" },
      sensitiveFilePatterns: {
        type: "string",
        description: "Comma-separated file path patterns triggering elevated risk",
      },
      requiredReviewers: { type: "number", description: "Minimum human code reviewers" },
      protectedBranches: {
        type: "string",
        description: "Comma-separated branch patterns requiring stricter review",
      },
      ciRequired: { type: "boolean", description: "Require CI checks to pass" },
    },
  ),
  makeGuardTool(
    "guard.publish",
    "Evaluate content before publishing to a public channel. Detects profanity, PII patterns (SSN), and custom blocked words.",
    {
      channel: { type: "string", description: "Publishing channel (blog, social, etc.)" },
      content: { type: "string", description: "Content to publish" },
      profanityFilter: { type: "boolean", description: "Scan for profanity" },
      piiDetection: { type: "boolean", description: "Detect PII patterns (SSN, etc.)" },
      blockedWords: { type: "string", description: "Comma-separated custom blocked words" },
    },
  ),
  makeGuardTool(
    "guard.support_reply",
    "Evaluate a customer support reply before sending. Escalates messages containing refund commitments, legal threats, or configurable escalation keywords.",
    {
      ticketId: { type: "string", description: "Support ticket identifier" },
      replyText: { type: "string", description: "Reply text to send" },
      customerTier: {
        type: "string",
        enum: ["free", "pro", "enterprise"],
        description: "Customer tier for risk weighting",
      },
      escalationKeywords: {
        type: "string",
        description: "Comma-separated keywords triggering escalation",
      },
      autoEscalate: {
        type: "boolean",
        description: "Auto-escalate to human on keyword match",
      },
    },
  ),
  makeGuardTool(
    "guard.agent_action",
    "Evaluate a generic agent action. Blocks irreversible actions that have not been explicitly approved by a human.",
    {
      toolName: { type: "string", description: "Name of the MCP tool being invoked" },
      toolInput: { type: "object", description: "Input arguments for the tool" },
      irreversible: { type: "boolean", description: "Whether the action is irreversible" },
      toolAllowlist: {
        type: "string",
        description: "Comma-separated MCP tool names allowed without review",
      },
      toolBlocklist: {
        type: "string",
        description: "Comma-separated MCP tool names always requiring review",
      },
    },
  ),
  makeGuardTool(
    "guard.deployment",
    "Evaluate a deployment before it runs. Production deployments are flagged for human review; non-production environments are allowed through.",
    {
      service: { type: "string", description: "Service or application name" },
      version: { type: "string", description: "Version or commit SHA to deploy" },
      deployEnv: {
        type: "string",
        enum: ["dev", "staging", "prod"],
        description: "Target deployment environment",
      },
      rolloutStrategy: {
        type: "string",
        enum: ["canary", "blue-green", "rolling", "all-at-once"],
        description: "Rollout strategy",
      },
      requireProdApproval: {
        type: "boolean",
        description: "Require human approval for prod deploys",
      },
      rollbackEnabled: {
        type: "boolean",
        description: "Enable automatic rollback on failure",
      },
    },
  ),
  makeGuardTool(
    "guard.permission_escalation",
    "Evaluate a permission escalation request. Break-glass escalations are always flagged; standard permission changes are assessed against scope.",
    {
      targetUser: { type: "string", description: "User or service account to escalate" },
      requestedPermissions: {
        type: "array",
        description: "Permissions being requested",
        items: { type: "string" },
      },
      breakGlass: { type: "boolean", description: "Whether this is a break-glass escalation" },
      permEnv: {
        type: "string",
        enum: ["dev", "staging", "prod"],
        description: "Target environment",
      },
      maxEscalationLevel: {
        type: "number",
        description: "Maximum escalation levels (1-5)",
      },
      requireMfa: { type: "boolean", description: "Require MFA for approval" },
    },
  ),
];

// Derived from the canonical BUILT_IN_GUARD_DOMAINS — maps MCP tool names to guard types.
const GUARD_TYPE_MAP: Record<string, string> = Object.fromEntries(
  BUILT_IN_GUARD_DOMAINS.map((domain) => [`guard.${domain}`, domain]),
);

// Resolve the effective guard policy for a board from its policy assignment.
// Without this, a policy assigned via policy.assign has no effect on guard.* calls
// (GuardEngine.evaluate falls back to no policy). When a board has an assignment,
// derive a GuardPolicy from it: the assignment's policyId and quorum are honored,
// and the default risk/HITL thresholds apply — so a policy'd board routes high-risk
// actions to human review (REQUIRE_HUMAN) and enforces quorum in weighted decisions.
// Boards with no assignment keep the engine's default behavior (undefined policy).
function resolveBoardPolicy(
  assignments: Array<{
    boardId: string;
    policyId: string;
    quorum: number;
    riskThreshold?: number;
    hitlRequiredAboveRisk?: number;
  }> | undefined,
  boardId: string | undefined,
): GuardPolicy | undefined {
  if (!boardId || !assignments) return undefined;
  const assignment = assignments.find((p) => p.boardId === boardId);
  if (!assignment) return undefined;
  return {
    ...DEFAULT_GUARD_POLICY,
    policyId: assignment.policyId,
    quorum: assignment.quorum,
    ...(assignment.riskThreshold !== undefined ? { riskThreshold: assignment.riskThreshold } : {}),
    ...(assignment.hitlRequiredAboveRisk !== undefined ? { hitlRequiredAboveRisk: assignment.hitlRequiredAboveRisk } : {}),
  };
}

// The public MCP guard tools advertise ergonomic payload keys (filesChanged, diff,
// content, replyText, deployEnv, requestedPermissions, ...). The deterministic
// evaluators in @consensus-tools/guards read a different, internal key set (files,
// diff_summary, text, message, env, permission, ...). Without translation, a payload
// sent exactly per the advertised schema reaches the evaluator as empty and every
// guard silently votes ALLOW. This maps the advertised keys onto the evaluator
// contract so the guards actually inspect what callers send.
function translateGuardPayload(
  domain: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const p = { ...payload };
  const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
  switch (domain) {
    case "send_email": {
      const attachments = payload["attachments"];
      if (payload["attachment"] === undefined && Array.isArray(attachments) && attachments.length > 0) {
        p["attachment"] = attachments;
      }
      return p;
    }
    case "code_merge": {
      if (payload["files"] === undefined && payload["filesChanged"] !== undefined) p["files"] = payload["filesChanged"];
      if (payload["diff_summary"] === undefined && payload["diff"] !== undefined) p["diff_summary"] = payload["diff"];
      return p;
    }
    case "publish": {
      if (payload["text"] === undefined && payload["content"] !== undefined) p["text"] = payload["content"];
      return p;
    }
    case "support_reply": {
      if (payload["message"] === undefined && payload["replyText"] !== undefined) p["message"] = payload["replyText"];
      return p;
    }
    case "deployment": {
      if (payload["env"] === undefined && payload["deployEnv"] !== undefined) p["env"] = payload["deployEnv"];
      return p;
    }
    case "permission_escalation": {
      const requested = payload["requestedPermissions"];
      if (payload["permission"] === undefined && requested !== undefined) {
        p["permission"] = Array.isArray(requested) && requested.includes("*") ? "*" : first(requested);
      }
      return p;
    }
    // agent_action already shares its key (`irreversible`) with the evaluator.
    default:
      return p;
  }
}

export async function handle(
  name: string,
  args: Record<string, unknown>,
  ctx: McpContext,
): Promise<{ content: [{ type: "text"; text: string }] } | { isError: true; content: [{ type: "text"; text: string }] }> {
  try {
    // ── Policy tools ────────────────────────────────────────
    if (name === "policy.assign") {
      const parsedPolicy = policyAssignmentSchema.safeParse(args);
      if (!parsedPolicy.success) {
        return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Validation failed", details: parsedPolicy.error.issues }) }] };
      }
      const assignment = parsedPolicy.data;
      const boardId = assignment.boardId;

      await ctx.storage.update((state) => {
        const existing = state.policyAssignments.findIndex((p) => p.boardId === boardId);
        if (existing >= 0) {
          state.policyAssignments[existing] = assignment;
        } else {
          state.policyAssignments.push(assignment);
        }
      });

      const state = await ctx.storage.getState();
      const assigned = state.policyAssignments.find((p) => p.boardId === boardId);
      return { content: [{ type: "text", text: JSON.stringify(assigned) }] };
    }

    if (name === "policy.list") {
      const state = await ctx.storage.getState();
      const boardId = args.boardId ? String(args.boardId) : undefined;
      const results = boardId
        ? state.policyAssignments.filter((p) => p.boardId === boardId)
        : state.policyAssignments;
      return { content: [{ type: "text", text: JSON.stringify(results) }] };
    }

    // ── Guard tools ─────────────────────────────────────────
    const guardType = GUARD_TYPE_MAP[name];
    const action = args.action as { type?: string; payload?: Record<string, unknown> } | undefined;

    // guard.evaluate is the generic tool — it MUST carry an explicit action with a
    // type. Fabricating a fallback type ("evaluate") routes to the permissive generic
    // evaluator, which always votes ALLOW — a silent pass for a malformed request.
    if (!guardType) {
      if (!action || typeof action.type !== "string" || !action.type) {
        return { isError: true, content: [{ type: "text", text: "guard.evaluate requires an 'action' object with a non-empty 'type'" }] };
      }
      // Gate on the engine's actual evaluator set, NOT guardTypeSchema: schema types
      // with no registered evaluator (seo_fix, diff_check) would fall through to the
      // generic always-YES evaluator — a silent ALLOW. Custom domains registered on
      // the engine's evaluator registry are accepted.
      const supported = ctx.guardEngine.supportedGuardTypes();
      if (!supported.includes(action.type)) {
        return { isError: true, content: [{ type: "text", text: `Unknown guard action type: ${action.type}. This server can evaluate: ${supported.join(", ")}` }] };
      }
    }

    const resolvedType = guardType ?? action!.type!;
    const rawPayload = action?.payload ?? {};
    // Translate advertised keys for ANY built-in domain, whether invoked via a named
    // guard.<domain> tool or via guard.evaluate with an explicit domain type — so the
    // same payload doesn't silently pass through as ALLOW on the guard.evaluate path.
    const payload = BUILT_IN_GUARD_DOMAINS.includes(resolvedType as (typeof BUILT_IN_GUARD_DOMAINS)[number])
      ? translateGuardPayload(resolvedType, rawPayload)
      : rawPayload;

    const rawInput = {
      boardId: args.boardId,
      runId: args.runId,
      agentId: args.agentId,
      action: {
        type: resolvedType,
        payload,
      },
      policyPack: args.policyPack,
    };

    const parsed = guardInputZod.safeParse(rawInput);
    if (!parsed.success) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Validation failed", details: parsed.error.issues }) }] };
    }

    // Apply the board's assigned policy (if any) so policy.assign actually governs
    // this evaluation instead of being a no-op.
    const state = await ctx.storage.getState();
    const policy = resolveBoardPolicy(state.policyAssignments, parsed.data.boardId);

    const result = policy
      ? await ctx.guardEngine.evaluate(parsed.data, policy)
      : await ctx.guardEngine.evaluate(parsed.data);

    // REQUIRE_HUMAN on a standalone guard call must register a pending approval —
    // otherwise a later human.approve has nothing to resolve and the decision is a
    // dead end. Key the approval on the caller's runId (minted if absent) so the
    // response tells the caller exactly how to complete the review. The tracker's
    // deadline timer auto-BLOCKs on expiry, so an unanswered escalation fails closed.
    if (result.decision === "REQUIRE_HUMAN") {
      // `||`, not `??`: an empty-string runId would otherwise key the approval on ""
      // and collide with every other empty-runId escalation.
      const runId = parsed.data.runId || `run_${randomUUID()}`;
      // A retry of the same runId must not stack a second pending approval — but only
      // reuse an approval that belongs to THIS board. A cross-board runId collision
      // would hand this caller a next_step that resolves someone else's escalation.
      const existing = await ctx.hitlTracker.getPendingApproval(runId);
      if (existing && existing.boardId !== parsed.data.boardId) {
        return { isError: true, content: [{ type: "text", text: `runId ${runId} already has a pending approval on board ${existing.boardId}; use a distinct runId for board ${parsed.data.boardId}` }] };
      }
      const approval =
        existing ??
        (await ctx.hitlTracker.registerPendingApproval({
          runId,
          boardId: parsed.data.boardId,
          timeoutSec: DEFAULT_HITL_TIMEOUT_SEC,
          requiredVotes: 1,
          mode: "approval",
          autoDecisionOnExpiry: "BLOCK",
        }));
      const priorInput =
        result.next_step && typeof result.next_step.input === "object" && result.next_step.input !== null
          ? (result.next_step.input as Record<string, unknown>)
          : {};
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            ...result,
            runId,
            next_step: { tool: "human.approve", input: { ...priorInput, runId } },
            hitl: {
              approvalId: approval.id,
              timeoutSec: approval.timeoutSec,
              autoDecisionOnExpiry: approval.autoDecisionOnExpiry,
            },
          }),
        }],
      };
    }

    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}
