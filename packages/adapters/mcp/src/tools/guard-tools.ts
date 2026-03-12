import { guardEvaluateInputSchema as guardInputZod } from "@consensus-tools/schemas";
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

const GUARD_TYPE_MAP: Record<string, string> = {
  "guard.send_email": "send_email",
  "guard.code_merge": "code_merge",
  "guard.publish": "publish",
  "guard.support_reply": "support_reply",
  "guard.agent_action": "agent_action",
  "guard.deployment": "deployment",
  "guard.permission_escalation": "permission_escalation",
};

export async function handle(
  name: string,
  args: Record<string, unknown>,
  ctx: McpContext,
): Promise<{ content: [{ type: "text"; text: string }] } | { isError: true; content: [{ type: "text"; text: string }] }> {
  try {
    const guardType = GUARD_TYPE_MAP[name];
    const action = args.action as { type: string; payload: Record<string, unknown> } | undefined;

    const rawInput = {
      boardId: args.boardId,
      runId: args.runId,
      agentId: args.agentId,
      action: {
        type: guardType ?? action?.type ?? "evaluate",
        payload: action?.payload ?? {},
      },
      policyPack: args.policyPack,
    };

    const parsed = guardInputZod.safeParse(rawInput);
    if (!parsed.success) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Validation failed", details: parsed.error.issues }) }] };
    }

    const result = await ctx.guardEngine.evaluate(parsed.data);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}
