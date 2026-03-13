import http from "node:http";
import type { ConsensusToolsConfig, GuardEvaluateInput, Participant, AgentConfig, Workflow, WorkflowRun, CronSchedule, PolicyAssignment, ConsensusVote } from "@consensus-tools/schemas";
import {
  parseHumanApprovalYesNo, policyAssignmentSchema,
  agentIdFieldSchema, jobPostInputSchema, claimInputSchema, submitInputSchema,
  voteInputSchema, resolveInputSchema, guardEvaluateInputSchema,
  humanApprovalRequestSchema, agentConfigSchema,
  workflowCreateInputSchema, cronRegisterInputSchema, consensusVoteSchema,
} from "@consensus-tools/schemas";
import { tallyVotes, computeEffectiveWeight } from "@consensus-tools/guards";
import type {
  JobEngine, JobPostInput, ClaimInput, SubmitInput, LedgerEngine,
  IStorage, AgentRegistry, GuardEngine, HitlTracker,
} from "@consensus-tools/core";
import { newId, nowIso } from "@consensus-tools/core";
import { listTemplates, getTemplateById } from "@consensus-tools/workflows";
import type { CredentialManager } from "@consensus-tools/secrets";
import type { WebhookHandlerContext, WorkflowRunner, CronScheduler, ServerDeps } from "./types.js";
import { handleGitHubWebhook, handleLinearWebhook, handleSlackWebhook, handleTeamsWebhook, handleDiscordWebhook, handleTelegramWebhook, handleGenericChatWebhook } from "./handlers/webhooks.js";
import { handleChatApprovalReply, handleWorkflowRunApprove } from "./handlers/chat-approval.js";
import { handleListCredentials, handleUpsertCredential, handleDeleteCredential, handleProviderStatus } from "./handlers/credentials.js";
import { ToolRegistry } from "./handlers/tool-registry.js";
import { handleListAdapters, handleInstallAdapter, handleUninstallAdapter } from "./handlers/adapters.js";
import { SlidingWindowRateLimiter } from "./rate-limiter.js";

export type { WorkflowRunner, CronScheduler, ServerDeps };

const MAX_BODY = 1024 * 1024;

const VALID_NODE_TYPES = ["trigger", "agent", "guard", "hitl", "action", "group"];

function validateWorkflowNodes(definition: Record<string, unknown> | undefined): string | null {
  if (!definition) return null; // template-based workflows may have no definition
  const nodes = definition.nodes;
  if (!nodes || !Array.isArray(nodes)) return "definition.nodes must be an array";
  for (const node of nodes) {
    if (!node.type) return `Node ${node.id || "?"} missing type`;
    if (!VALID_NODE_TYPES.includes(node.type)) return `Node ${node.id || "?"} has invalid type: ${node.type}`;
    const cfg = node.config as Record<string, unknown> | undefined;
    if (node.type === "guard" && cfg?.quorum != null) {
      const q = Number(cfg.quorum);
      if (isNaN(q) || q < 0 || q > 1) return `Node ${node.id}: quorum must be 0-1`;
    }
    if (node.type === "agent" && cfg?.agentCount != null) {
      const c = Number(cfg.agentCount);
      if (isNaN(c) || c < 1 || c > 25) return `Node ${node.id}: agentCount must be 1-25`;
    }
  }
  return null;
}

export class ConsensusToolsServer {
  private server?: http.Server;
  private readonly config: ConsensusToolsConfig;
  private readonly engine: JobEngine;
  private readonly ledger: LedgerEngine;
  private readonly storage: IStorage;
  private readonly agentRegistry?: AgentRegistry;
  private readonly guardEngine?: GuardEngine;
  private readonly hitlTracker?: HitlTracker;
  private readonly workflowRunner?: WorkflowRunner;
  private readonly cronScheduler?: CronScheduler;
  private readonly credentialManager?: CredentialManager;
  private readonly toolRegistry: ToolRegistry;
  private readonly rateLimiter?: SlidingWindowRateLimiter;
  private readonly logger?: { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void };

  constructor(deps: ServerDeps) {
    this.config = deps.config;
    this.engine = deps.engine;
    this.ledger = deps.ledger;
    this.storage = deps.storage;
    this.agentRegistry = deps.agentRegistry;
    this.guardEngine = deps.guardEngine;
    this.hitlTracker = deps.hitlTracker;
    this.workflowRunner = deps.workflowRunner;
    this.cronScheduler = deps.cronScheduler;
    this.credentialManager = deps.credentialManager;
    this.toolRegistry = new ToolRegistry({ storage: deps.storage, guardEngine: deps.guardEngine });
    this.logger = deps.logger;
    const rl = deps.config.local.server.rateLimit;
    if (rl?.enabled) {
      this.rateLimiter = new SlidingWindowRateLimiter(rl.windowMs, rl.maxRequests);
    }
  }

  async start(): Promise<void> {
    if (this.server) return;
    const { host, port } = this.config.local.server;
    this.server = http.createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => {
      this.server?.listen(port, host, () => resolve());
    });
    this.logger?.info?.(`consensus-tools server started (${host}:${port})`);
    if (!this.config.local.server.authToken) {
      this.logger?.warn?.("[server] WARNING: No auth token configured — API is unauthenticated");
    }
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const srv = this.server;
    this.server = undefined;
    await new Promise<void>((resolve, reject) => srv.close((err) => (err ? reject(err) : resolve())));
    this.logger?.info?.("consensus-tools server stopped");
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS
    const allowedOrigins = this.config.local.server.corsOrigins ?? "*";
    const reqOrigin = req.headers.origin || "";
    let corsOrigin: string;
    if (allowedOrigins === "*") {
      corsOrigin = "*";
    } else {
      const list = Array.isArray(allowedOrigins) ? allowedOrigins : [allowedOrigins];
      corsOrigin = list.includes(reqOrigin) ? reqOrigin : (list[0] || "");
    }
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-agent-key");
    if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const path = url.pathname;
      const method = req.method || "GET";

      // ── Health check (unauthenticated) ────────────────────
      if (method === "GET" && path === "/healthz") {
        return this.reply(res, 200, { status: "ok", uptime: process.uptime() });
      }

      if (this.config.local.server.authToken) {
        const auth = req.headers.authorization || "";
        if (auth !== `Bearer ${this.config.local.server.authToken}`) {
          return this.reply(res, 401, { error: "Unauthorized" });
        }
      }

      // ── Rate limiting ──────────────────────────────────────
      if (this.rateLimiter) {
        const clientKey = req.socket.remoteAddress || "unknown";
        const check = this.rateLimiter.check(clientKey);
        if (!check.allowed) {
          res.setHeader("Retry-After", String(Math.ceil(check.retryAfterMs / 1000)));
          return this.reply(res, 429, { error: "Too many requests" });
        }
      }

      // ── Job routes (existing) ───────────────────────────────
      if (method === "POST" && path === "/jobs") {
        const body = await this.readJson(req);
        const agent = this.parseBody(agentIdFieldSchema, body, res);
        if (!agent) return;
        const input = this.parseBody(jobPostInputSchema, body, res);
        if (!input) return;
        const job = await this.engine.postJob(agent.agentId, input as JobPostInput);
        return this.reply(res, 200, job);
      }

      if (method === "GET" && path === "/jobs") {
        const jobs = await this.engine.listJobs({
          status: url.searchParams.get("status") || undefined,
          tag: url.searchParams.get("tag") || undefined,
          mine: url.searchParams.get("mine") || undefined,
        });
        return this.reply(res, 200, jobs);
      }

      const jobMatch = path.match(/^\/jobs\/([^/]+)(?:\/(claim|submit|vote|resolve|status))?$/);
      if (jobMatch) {
        const jobId = jobMatch[1]!;
        const action = jobMatch[2];

        if (method === "GET" && !action) {
          const job = await this.engine.getJob(jobId);
          if (!job) return this.reply(res, 404, { error: "Job not found" });
          return this.reply(res, 200, job);
        }
        if (method === "GET" && action === "status") {
          return this.reply(res, 200, await this.engine.getStatus(jobId));
        }
        if (method === "POST" && action === "claim") {
          const body = await this.readJson(req);
          const agent = this.parseBody(agentIdFieldSchema, body, res);
          if (!agent) return;
          const input = this.parseBody(claimInputSchema, body, res);
          if (!input) return;
          return this.reply(res, 200, await this.engine.claimJob(agent.agentId, jobId, input as ClaimInput));
        }
        if (method === "POST" && action === "submit") {
          const body = await this.readJson(req);
          const agent = this.parseBody(agentIdFieldSchema, body, res);
          if (!agent) return;
          const input = this.parseBody(submitInputSchema, body, res);
          if (!input) return;
          return this.reply(res, 200, await this.engine.submitJob(agent.agentId, jobId, input as SubmitInput));
        }
        if (method === "POST" && action === "vote") {
          const body = await this.readJson(req);
          const agent = this.parseBody(agentIdFieldSchema, body, res);
          if (!agent) return;
          const input = this.parseBody(voteInputSchema, body, res);
          if (!input) return;
          return this.reply(res, 200, await this.engine.vote(agent.agentId, jobId, input));
        }
        if (method === "POST" && action === "resolve") {
          const body = await this.readJson(req);
          const agent = this.parseBody(agentIdFieldSchema, body, res);
          if (!agent) return;
          const input = this.parseBody(resolveInputSchema, body, res);
          if (!input) return;
          return this.reply(res, 200, await this.engine.resolveJob(agent.agentId, jobId, input));
        }
      }

      const ledgerMatch = path.match(/^\/ledger\/([^/]+)$/);
      if (method === "GET" && ledgerMatch) {
        const agentId = ledgerMatch[1]!;
        const balance = await this.ledger.getBalance(agentId);
        return this.reply(res, 200, { agentId, balance });
      }

      // ── Guard evaluation ────────────────────────────────────
      if (method === "POST" && (path === "/api/guard.evaluate" || path === "/api/mcp/evaluate")) {
        if (!this.guardEngine) return this.reply(res, 501, { error: "Guard engine not configured" });
        const body = await this.readJson(req);
        // Allow shorthand: { type, payload } → { action: { type, payload } }
        if (!body.action && body.type) {
          body.action = { type: body.type, payload: body.payload ?? {} };
        }
        const parsed = this.parseBody(guardEvaluateInputSchema, body, res);
        if (!parsed) return;
        const result = await this.guardEngine.evaluate(parsed, body.policy);
        return this.reply(res, 200, result);
      }

      // ── Human approval (HITL) ───────────────────────────────
      if (method === "POST" && path === "/api/human.approve") {
        if (!this.hitlTracker) return this.reply(res, 501, { error: "HITL tracker not configured" });
        const body = await this.readJson(req);
        const parsed = parseHumanApprovalYesNo(body.decision ?? body.vote ?? "");
        if (!parsed) return this.reply(res, 400, { error: "Invalid decision — expected YES, NO, or REWRITE" });
        const voteResult = await this.hitlTracker.recordVoteReceived(body.runId);
        if (voteResult.complete && this.workflowRunner) {
          const state = await this.storage.getState();
          const run = state.workflowRuns.find((r) => r.runId === body.runId);
          if (run) {
            try {
              await this.workflowRunner.resume(run.workflowId, body.runId, parsed, body.approver ?? "human");
            } catch { /* resume best-effort; vote is already recorded */ }
          }
        }
        return this.reply(res, 200, { ok: true, decision: parsed, runId: body.runId, complete: voteResult.complete });
      }

      if (method === "GET" && path === "/api/hitl/pending") {
        if (!this.hitlTracker) return this.reply(res, 501, { error: "HITL tracker not configured" });
        const pending = await this.hitlTracker.listPending();
        return this.reply(res, 200, pending);
      }

      // ── Agent management ────────────────────────────────────
      if (path === "/api/agents") {
        if (!this.agentRegistry) return this.reply(res, 501, { error: "Agent registry not configured" });
        if (method === "GET") {
          return this.reply(res, 200, await this.agentRegistry.listAgents());
        }
        if (method === "POST") {
          const body = await this.readJson(req);
          const parsed = this.parseBody(agentConfigSchema, body, res);
          if (!parsed) return;
          const config = {
            ...parsed,
            metadata: {
              ...((parsed.metadata as Record<string, unknown>) ?? {}),
              ...(body.boards ? { boards: body.boards } : {}),
              ...(body.workflows ? { workflows: body.workflows } : {}),
            },
          } as AgentConfig;
          const agent = await this.agentRegistry.createAgent(config);
          return this.reply(res, 201, agent);
        }
      }

      const agentActionMatch = path.match(/^\/api\/agents\/([^/]+)\/(suspend|activate)$/);
      if (method === "POST" && agentActionMatch) {
        if (!this.agentRegistry) return this.reply(res, 501, { error: "Agent registry not configured" });
        const agentId = decodeURIComponent(agentActionMatch[1]!);
        const action = agentActionMatch[2]!;
        const result = action === "suspend"
          ? await this.agentRegistry.suspendAgent(agentId)
          : await this.agentRegistry.activateAgent(agentId);
        if (!result) return this.reply(res, 404, { error: "Agent not found" });
        return this.reply(res, 200, result);
      }

      // ── Participant management ──────────────────────────────
      if (path === "/api/participants") {
        if (method === "GET") {
          const boardId = url.searchParams.get("boardId");
          const state = await this.storage.getState();
          const participants = boardId
            ? state.participants.filter((p) => p.boardId === boardId)
            : state.participants;
          const mapped = participants.map((p) => ({
            ...p,
            subject_id: p.subjectId,
            subject_type: p.subjectType,
          }));
          return this.reply(res, 200, { participants: mapped });
        }
        if (method === "POST") {
          const body = await this.readJson(req);
          const participant: Participant = {
            id: body.id ?? newId("part"),
            boardId: body.boardId,
            subjectType: body.subjectType ?? "agent",
            subjectId: body.subjectId,
            role: body.role ?? "voter",
            weight: body.weight ?? 1,
            reputation: body.reputation ?? 50,
            status: "active",
            metadata: body.metadata ?? {},
            createdAt: nowIso(),
          };
          await this.storage.update((state) => { state.participants.push(participant); });
          return this.reply(res, 201, participant);
        }
      }

      const participantMatch = path.match(/^\/api\/participants\/([^/]+)$/);
      if (participantMatch) {
        const pid = decodeURIComponent(participantMatch[1]!);
        if (method === "PATCH") {
          const body = await this.readJson(req);
          const updated = (await this.storage.update((state) => {
            const p = state.participants.find((x) => x.id === pid);
            if (!p) return null;
            if (body.reputation !== undefined) p.reputation = body.reputation;
            if (body.weight !== undefined) p.weight = body.weight;
            if (body.role !== undefined) p.role = body.role;
            if (body.status !== undefined) p.status = body.status;
            if (body.metadata !== undefined) p.metadata = body.metadata;
            return p;
          })).result;
          if (!updated) return this.reply(res, 404, { error: "Participant not found" });
          return this.reply(res, 200, updated);
        }
        if (method === "DELETE") {
          const removed = (await this.storage.update((state) => {
            const idx = state.participants.findIndex((x) => x.id === pid);
            if (idx === -1) return false;
            state.participants.splice(idx, 1);
            return true;
          })).result;
          if (!removed) return this.reply(res, 404, { error: "Participant not found" });
          return this.reply(res, 200, { ok: true });
        }
      }

      // ── Agent trigger ───────────────────────────────────────
      if (method === "POST" && path === "/api/agent/trigger") {
        if (!this.agentRegistry) return this.reply(res, 501, { error: "Agent registry not configured" });
        const key = (req.headers["x-agent-key"] as string | undefined) ?? "";
        if (!key) return this.reply(res, 401, { error: "Missing x-agent-key" });

        // Match by apiKeyHash — caller should send the hash, or we compare directly
        const agents = await this.agentRegistry.listAgents();
        const agent = agents.find((a) => a.apiKeyHash === key && a.status === "active");
        if (!agent) return this.reply(res, 401, { error: "Invalid or missing x-agent-key" });

        const body = await this.readJson(req);
        const scopes = agent.scopes;
        const boards = (agent.metadata?.boards as string[]) ?? [];
        const workflows = (agent.metadata?.workflows as string[]) ?? [];

        if (body.workflowId) {
          if (!scopes.includes("workflow.run") && scopes.length > 0) {
            return this.reply(res, 403, { error: "Missing scope workflow.run" });
          }
          if (workflows.length && !workflows.includes(body.workflowId)) {
            return this.reply(res, 403, { error: "Workflow not in agent allowlist" });
          }
          if (!this.workflowRunner) return this.reply(res, 501, { error: "Workflow runner not configured" });
          const run = await this.workflowRunner.run(body.workflowId, { context: body.input });
          return this.reply(res, 200, { ok: true, via: "workflow", agent: { id: agent.id, name: agent.name }, ...run });
        }

        if (body.tool) {
          if (scopes.length > 0 && !scopes.includes(body.tool) && !scopes.includes("tool.*")) {
            return this.reply(res, 403, { error: `Missing scope ${body.tool}` });
          }
          if (body.boardId && boards.length && !boards.includes(body.boardId)) {
            return this.reply(res, 403, { error: "Board not in agent allowlist" });
          }
          const toolResult = await this.toolRegistry.invoke(body.tool, body.input ?? {});
          return this.reply(res, 200, { ok: true, via: "tool", agent: { id: agent.id, name: agent.name }, tool: body.tool, result: toolResult });
        }

        return this.reply(res, 400, { error: "Provide workflowId or tool" });
      }

      // ── Policy assignment ──────────────────────────────────
      if (method === "POST" && path === "/api/policies/assign") {
        const body = await this.readJson(req);
        const parsed = policyAssignmentSchema.safeParse(body);
        if (!parsed.success) return this.reply(res, 400, { error: "Invalid policy assignment", details: parsed.error.message });
        const assignment = parsed.data;
        await this.storage.update((state) => {
          const idx = state.policyAssignments.findIndex(
            (p) => p.boardId === assignment.boardId && p.policyId === assignment.policyId,
          );
          if (idx >= 0) state.policyAssignments[idx] = assignment;
          else state.policyAssignments.push(assignment);
        });
        return this.reply(res, 200, { assignment });
      }

      const policyMatch = path.match(/^\/api\/policies\/([^/]+)\/([^/]+)$/);
      if (method === "GET" && policyMatch) {
        const boardId = decodeURIComponent(policyMatch[1]!);
        const policyId = decodeURIComponent(policyMatch[2]!);
        const state = await this.storage.getState();
        const assignment = state.policyAssignments.find(
          (p) => p.boardId === boardId && p.policyId === policyId,
        );
        if (!assignment) return this.reply(res, 404, { error: "Policy assignment not found" });
        return this.reply(res, 200, { assignment });
      }

      // ── Consensus votes ──────────────────────────────────────
      if (method === "POST" && path === "/api/votes") {
        const body = await this.readJson(req);
        const vote: ConsensusVote = {
          id: newId("cvote"),
          boardId: body.boardId,
          runId: body.runId,
          participantId: body.participantId,
          decision: body.decision,
          confidence: body.confidence ?? 1,
          rationale: body.rationale ?? "",
          idempotencyKey: body.idempotencyKey ?? `${body.runId}:${body.participantId}`,
          createdAt: nowIso(),
        };
        await this.storage.update((state) => { state.consensusVotes.push(vote); });
        // Aggregate using guards voting utilities
        const state = await this.storage.getState();
        const runVotes = state.consensusVotes.filter((v) => v.runId === body.runId);
        const aggregate = this.aggregateConsensusVotes(runVotes, body.boardId, state);
        return this.reply(res, 200, { vote, aggregate });
      }

      const votesMatch = path.match(/^\/api\/votes\/([^/]+)$/);
      if (method === "GET" && votesMatch) {
        const runId = decodeURIComponent(votesMatch[1]!);
        const state = await this.storage.getState();
        const runVotes = state.consensusVotes.filter((v) => v.runId === runId);
        const boardId = runVotes[0]?.boardId;
        const participants = boardId ? state.participants.filter((p) => p.boardId === boardId) : [];
        const participantMap: Record<string, Participant> = {};
        for (const p of participants) participantMap[p.id] = p;
        const enrichedVotes = runVotes.map((v) => {
          const p = participantMap[v.participantId] ?? null;
          return {
            ...v,
            participant_id: v.participantId,
            participant: p ? { ...p, subject_id: p.subjectId, subject_type: p.subjectType } : null,
            weight_snapshot: p?.weight ?? 1,
            reputation_snapshot: p?.reputation ?? 0,
          };
        });
        const mappedParticipants = participants.map((p) => ({
          ...p,
          subject_id: p.subjectId,
          subject_type: p.subjectType,
        }));
        const aggregate = boardId ? this.aggregateConsensusVotes(runVotes, boardId, state) : null;
        return this.reply(res, 200, { votes: enrichedVotes, aggregate, participants: mappedParticipants });
      }

      // ── Workflow management ─────────────────────────────────
      if (path === "/api/workflows") {
        if (!this.workflowRunner) return this.reply(res, 501, { error: "Workflow runner not configured" });
        if (method === "GET") {
          const workflows = await this.workflowRunner.listWorkflows();
          return this.reply(res, 200, { workflows });
        }
        if (method === "POST") {
          const body = await this.readJson(req);
          const parsed = this.parseBody(workflowCreateInputSchema, body, res);
          if (!parsed) return;
          const validationError = validateWorkflowNodes(parsed.definition as Record<string, unknown>);
          if (validationError) return this.reply(res, 400, { error: validationError });
          const workflow = await this.workflowRunner.createWorkflow(
            parsed.name, parsed.definition as Record<string, unknown>, parsed.templateId,
          );
          return this.reply(res, 201, { workflow });
        }
      }

      const workflowRunMatch = path.match(/^\/api\/workflows\/([^/]+)\/run$/);
      if (method === "POST" && workflowRunMatch) {
        if (!this.workflowRunner) return this.reply(res, 501, { error: "Workflow runner not configured" });
        const wfId = decodeURIComponent(workflowRunMatch[1]!);
        const run = await this.workflowRunner.run(wfId);
        return this.reply(res, 200, run);
      }

      const workflowIdMatch = path.match(/^\/api\/workflows\/([^/]+)$/);
      if (workflowIdMatch) {
        if (!this.workflowRunner) return this.reply(res, 501, { error: "Workflow runner not configured" });
        const wfId = decodeURIComponent(workflowIdMatch[1]!);

        if (method === "GET") {
          const state = await this.storage.getState();
          const workflow = state.workflows.find((w) => w.id === wfId);
          if (!workflow) return this.reply(res, 404, { error: "Workflow not found" });
          const runs = state.workflowRuns.filter((r) => r.workflowId === wfId).map((r) => ({
            ...r,
            run_id: r.runId,
            started_at: r.createdAt,
            completed_at: r.completedAt ?? null,
            duration_ms: r.completedAt
              ? new Date(r.completedAt).getTime() - new Date(r.createdAt).getTime()
              : null,
            result: r.result ?? null,
          }));
          return this.reply(res, 200, { workflow, runs });
        }

        if (method === "PUT") {
          const body = await this.readJson(req);
          if (body.definition !== undefined) {
            const validationError = validateWorkflowNodes(body.definition);
            if (validationError) return this.reply(res, 400, { error: validationError });
          }
          const updated = (await this.storage.update((state) => {
            const wf = state.workflows.find((w) => w.id === wfId);
            if (!wf) return null;
            if (body.name !== undefined) wf.name = body.name;
            if (body.definition !== undefined) wf.definition = body.definition;
            wf.updatedAt = nowIso();
            return wf;
          })).result;
          if (!updated) return this.reply(res, 404, { error: "Workflow not found" });
          return this.reply(res, 200, { workflow: updated });
        }

        if (method === "DELETE") {
          const removed = (await this.storage.update((state) => {
            const idx = state.workflows.findIndex((w) => w.id === wfId);
            if (idx === -1) return false;
            state.workflows.splice(idx, 1);
            return true;
          })).result;
          if (!removed) return this.reply(res, 404, { error: "Workflow not found" });
          return this.reply(res, 200, { ok: true });
        }
      }

      // ── Cron scheduling ─────────────────────────────────────
      if (method === "GET" && path === "/api/cron") {
        const state = await this.storage.getState();
        return this.reply(res, 200, state.cronSchedules);
      }

      const cronMatch = path.match(/^\/api\/workflows\/([^/]+)\/cron$/);
      if (cronMatch) {
        if (!this.cronScheduler) return this.reply(res, 501, { error: "Cron scheduler not configured" });
        const wfId = decodeURIComponent(cronMatch[1]!);
        if (method === "POST") {
          const body = await this.readJson(req);
          const parsed = this.parseBody(cronRegisterInputSchema, { ...body, workflowId: wfId }, res);
          if (!parsed) return;
          const schedule = await this.cronScheduler.register(wfId, parsed.cronExpression);
          return this.reply(res, 201, schedule);
        }
        if (method === "DELETE") {
          await this.cronScheduler.unregister(wfId);
          return this.reply(res, 200, { ok: true });
        }
      }

      // ── Board / run / audit queries ─────────────────────────
      if (path === "/api/mcp/boards") {
        if (method === "GET") {
          const state = await this.storage.getState();
          // Derive boards from jobs AND audit events (workflow runs use audit boardId)
          const jobBoardIds = state.jobs.map((j) => j.boardId).filter(Boolean);
          const auditBoardIds = state.audit
            .map((e) => (e.details as Record<string, unknown>)?.boardId)
            .filter(Boolean) as string[];
          const boardIds = [...new Set([...jobBoardIds, ...auditBoardIds])];
          const boards = boardIds.map((id) => {
            const jobCount = state.jobs.filter((j) => j.boardId === id).length;
            const runIds = new Set(
              state.audit
                .filter((e) => (e.details as Record<string, unknown>)?.boardId === id)
                .map((e) => (e.details as Record<string, unknown>)?.runId)
                .filter(Boolean),
            );
            const firstEvent = state.audit.find((e) => (e.details as Record<string, unknown>)?.boardId === id);
            return {
              id,
              name: id,
              jobs: jobCount + runIds.size,
              created_at: state.jobs.find((j) => j.boardId === id)?.createdAt ?? firstEvent?.at ?? "",
            };
          });
          return this.reply(res, 200, { boards });
        }
        if (method === "POST") {
          const body = await this.readJson(req);
          const boardId = body.name ?? body.id ?? newId("board");
          // Record board creation in audit trail (no orphan seed job)
          await this.storage.update((s) => {
            s.audit.push({
              id: newId("audit"),
              at: nowIso(),
              type: "board_created",
              actorAgentId: "system",
              details: { boardId, name: body.name, personaCount: body.personaCount },
            });
          });
          return this.reply(res, 201, { id: boardId });
        }
      }

      const boardIdMatch = path.match(/^\/api\/mcp\/boards\/([^/]+)$/);
      if (method === "GET" && boardIdMatch) {
        const boardId = decodeURIComponent(boardIdMatch[1]!);
        const state = await this.storage.getState();
        // Derive workflow run IDs from audit events for this board
        const runIds = [...new Set(
          state.audit
            .filter((e) => (e.details as Record<string, unknown>)?.boardId === boardId)
            .map((e) => (e.details as Record<string, unknown>)?.runId)
            .filter(Boolean) as string[],
        )];
        const wfRuns = state.workflowRuns
          .filter((r) => runIds.includes(r.runId))
          .map((r) => ({
            id: r.runId,
            status: r.status,
            started_at: r.createdAt,
            completed_at: r.completedAt ?? null,
            duration_ms: r.completedAt
              ? new Date(r.completedAt).getTime() - new Date(r.createdAt).getTime()
              : null,
            result: r.result ?? null,
          }));
        const board = { id: boardId, name: boardId };
        return this.reply(res, 200, { board, runs: wfRuns });
      }

      const runIdMatch = path.match(/^\/api\/mcp\/runs\/([^/]+)$/);
      if (method === "GET" && runIdMatch) {
        const runId = decodeURIComponent(runIdMatch[1]!);
        const state = await this.storage.getState();

        // Check workflow runs first
        const wfRun = state.workflowRuns.find((r) => r.runId === runId || r.id === runId);
        if (wfRun) {
          const rawEvents = state.audit.filter((e) =>
            (e.details as Record<string, unknown>)?.runId === runId
          );
          const events = rawEvents.map((e, i) => ({
            ...e,
            seq: i + 1,
            ts: new Date(e.at).getTime(),
            run_id: runId,
            payload_json: JSON.stringify(e.details ?? {}),
          }));
          const run = {
            ...wfRun,
            run_id: wfRun.runId,
            started_at: wfRun.createdAt,
            completed_at: wfRun.completedAt ?? null,
          };
          return this.reply(res, 200, { run, events });
        }

        // Fall back to jobs
        const job = state.jobs.find((j) => j.id === runId);
        if (!job) return this.reply(res, 404, { error: "Run not found" });
        const jobEvents = state.audit.filter((e) =>
          (e.details as Record<string, unknown>)?.runId === runId
          || (e.details as Record<string, unknown>)?.jobId === runId
        ).map((e, i) => ({
          ...e,
          seq: i + 1,
          ts: new Date(e.at).getTime(),
          run_id: runId,
          payload_json: JSON.stringify(e.details ?? {}),
        }));
        return this.reply(res, 200, { run: job, events: jobEvents });
      }

      if (path === "/api/mcp/events") {
        if (method === "GET") {
          const state = await this.storage.getState();
          const boardId = url.searchParams.get("boardId");
          const runId = url.searchParams.get("runId");
          const type = url.searchParams.get("type");
          const limit = parseInt(url.searchParams.get("limit") || "100", 10) || 100;
          let events = state.audit;
          if (boardId) events = events.filter((e) => (e.details as Record<string, unknown>)?.boardId === boardId);
          if (runId) events = events.filter((e) => (e.details as Record<string, unknown>)?.runId === runId);
          if (type) events = events.filter((e) => e.type === type);
          const mapped = events.slice(-limit).map((e, i) => ({
            ...e,
            seq: i + 1,
            ts: new Date(e.at).getTime(),
            run_id: (e.details as Record<string, unknown>)?.runId ?? "",
            payload_json: JSON.stringify(e.details ?? {}),
          }));
          return this.reply(res, 200, { events: mapped });
        }
        if (method === "DELETE") {
          const runId = url.searchParams.get("runId");
          const boardId = url.searchParams.get("boardId");
          let count = 0;
          await this.storage.update((state) => {
            const before = state.audit.length;
            state.audit = state.audit.filter((e) => {
              const d = e.details as Record<string, unknown>;
              if (runId && d?.runId === runId) return false;
              if (boardId && d?.boardId === boardId) return false;
              return true;
            });
            count = before - state.audit.length;
          });
          return this.reply(res, 200, { ok: true, deleted: count });
        }
      }

      if (method === "GET" && path === "/api/mcp/events/run-ids") {
        const state = await this.storage.getState();
        const ids = new Set<string>();
        for (const e of state.audit) {
          const rid = (e.details as Record<string, unknown>)?.runId as string | undefined;
          if (rid) ids.add(rid);
        }
        return this.reply(res, 200, { runIds: [...ids].slice(0, 100) });
      }

      if (method === "GET" && path === "/api/mcp/audit/search") {
        const state = await this.storage.getState();
        const q = url.searchParams.get("q") || "";
        const limit = parseInt(url.searchParams.get("limit") || "50", 10) || 50;
        // Support field-specific search: "type:AGENT_VERDICT", "runId:wfrun_abc", "boardId:workflow-system"
        const fieldMatch = q.match(/^(\w+):(.+)$/);
        const results = state.audit.filter((e) => {
          if (!q) return true;
          if (fieldMatch) {
            const [, field, value] = fieldMatch;
            if (field === "type") return e.type === value;
            const details = e.details as Record<string, unknown>;
            if (field === "runId") return details?.runId === value;
            if (field === "boardId") return details?.boardId === value;
          }
          return JSON.stringify(e).toLowerCase().includes(q.toLowerCase());
        });
        return this.reply(res, 200, results.slice(-limit));
      }

      if (method === "GET" && path === "/api/mcp/tools") {
        return this.reply(res, 200, { tools: this.toolRegistry.listToolNames() });
      }

      const toolInvokeMatch = path.match(/^\/api\/mcp\/tool\/([^/]+)$/);
      if (method === "POST" && toolInvokeMatch) {
        const toolName = decodeURIComponent(toolInvokeMatch[1]!);
        const body = await this.readJson(req);
        const result = await this.toolRegistry.invoke(toolName, body);
        return this.reply(res, 200, result);
      }

      // ── Webhook handler context ────────────────────────────
      const webhookCtx: WebhookHandlerContext = {
        storage: this.storage,
        hitlTracker: this.hitlTracker,
        workflowRunner: this.workflowRunner,
        credentialManager: this.credentialManager,
        logger: this.logger,
      };

      // ── Webhook routes ────────────────────────────────────
      if (method === "POST" && path === "/api/webhooks/github") {
        const rawBody = await this.readRaw(req);
        const headers: Record<string, string | undefined> = {
          "x-github-event": req.headers["x-github-event"] as string | undefined,
          "x-hub-signature-256": req.headers["x-hub-signature-256"] as string | undefined,
        };
        const result = await handleGitHubWebhook(webhookCtx, rawBody, headers);
        return this.reply(res, result.status, result.body);
      }

      if (method === "POST" && path === "/api/webhooks/linear") {
        const rawBody = await this.readRaw(req);
        const headers: Record<string, string | undefined> = {
          "linear-signature": req.headers["linear-signature"] as string | undefined,
        };
        const result = await handleLinearWebhook(webhookCtx, rawBody, headers);
        return this.reply(res, result.status, result.body);
      }

      if (method === "POST" && path === "/api/webhooks/slack/events") {
        const rawBody = await this.readRaw(req);
        let body: Record<string, unknown>;
        try { body = JSON.parse(rawBody.toString("utf8") || "{}"); }
        catch { return this.reply(res, 400, { error: "Invalid JSON body" }); }
        const hdrs = req.headers as Record<string, string | undefined>;
        const result = await handleSlackWebhook(webhookCtx, body, hdrs, rawBody);
        return this.reply(res, result.status, result.body);
      }

      if (method === "POST" && path === "/api/webhooks/teams/activity") {
        const body = await this.readJson(req);
        const hdrs = req.headers as Record<string, string | undefined>;
        const result = await handleTeamsWebhook(webhookCtx, body, hdrs);
        return this.reply(res, result.status, result.body);
      }

      if (method === "POST" && path === "/api/webhooks/discord/interactions") {
        const rawBody = await this.readRaw(req);
        let body: Record<string, unknown>;
        try { body = JSON.parse(rawBody.toString("utf8") || "{}"); }
        catch { return this.reply(res, 400, { error: "Invalid JSON body" }); }
        const hdrs = req.headers as Record<string, string | undefined>;
        const result = await handleDiscordWebhook(webhookCtx, body, hdrs, rawBody);
        return this.reply(res, result.status, result.body);
      }

      if (method === "POST" && path === "/api/webhooks/telegram") {
        const body = await this.readJson(req);
        const hdrs = req.headers as Record<string, string | undefined>;
        const result = await handleTelegramWebhook(webhookCtx, body, hdrs);
        return this.reply(res, result.status, result.body);
      }

      const chatAdapterMatch = path.match(/^\/api\/webhooks\/chat\/([^/]+)$/);
      if (method === "POST" && chatAdapterMatch) {
        let adapter: string;
        try { adapter = decodeURIComponent(chatAdapterMatch[1]!); }
        catch { return this.reply(res, 400, { error: "Invalid adapter name in URL" }); }
        const body = await this.readJson(req);
        const result = await handleGenericChatWebhook(webhookCtx, adapter, body);
        return this.reply(res, result.status, result.body);
      }

      // ── Chat approval ─────────────────────────────────────
      if (method === "POST" && path === "/api/chat/human-approval-reply") {
        const body = await this.readJson(req);
        const result = await handleChatApprovalReply(webhookCtx, body);
        return this.reply(res, result.status, result.body);
      }

      const wfRunApproveMatch = path.match(/^\/api\/workflow-runs\/([^/]+)\/approve$/);
      if (method === "POST" && wfRunApproveMatch) {
        let runId: string;
        try { runId = decodeURIComponent(wfRunApproveMatch[1]!); }
        catch { return this.reply(res, 400, { error: "Invalid run ID in URL" }); }
        const body = await this.readJson(req);
        const result = await handleWorkflowRunApprove(webhookCtx, runId, body);
        return this.reply(res, result.status, result.body);
      }

      // ── Credential management ─────────────────────────────
      if (path === "/api/settings/credentials") {
        if (method === "GET") {
          const result = handleListCredentials(webhookCtx);
          return this.reply(res, result.status, result.body);
        }
        if (method === "POST") {
          const body = await this.readJson(req);
          const result = handleUpsertCredential(webhookCtx, body);
          return this.reply(res, result.status, result.body);
        }
      }

      const credDeleteMatch = path.match(/^\/api\/settings\/credentials\/([^/]+)\/([^/]+)$/);
      if (credDeleteMatch) {
        const provider = decodeURIComponent(credDeleteMatch[1]!);
        const keyName = decodeURIComponent(credDeleteMatch[2]!);
        if (method === "DELETE") {
          const result = handleDeleteCredential(webhookCtx, provider, keyName);
          return this.reply(res, result.status, result.body);
        }
      }

      const credStatusMatch = path.match(/^\/api\/settings\/credentials\/([^/]+)\/status$/);
      if (method === "GET" && credStatusMatch) {
        const provider = decodeURIComponent(credStatusMatch[1]!);
        const result = handleProviderStatus(webhookCtx, provider);
        return this.reply(res, result.status, result.body);
      }

      // ── Adapter management ─────────────────────────────────
      if (method === "GET" && path === "/api/settings/adapters") {
        const result = handleListAdapters(webhookCtx);
        return this.reply(res, result.status, result.body);
      }
      if (method === "POST" && path === "/api/settings/adapters/install") {
        const body = await this.readJson(req);
        const result = handleInstallAdapter(webhookCtx, body);
        return this.reply(res, result.status, result.body);
      }
      if (method === "POST" && path === "/api/settings/adapters/uninstall") {
        const body = await this.readJson(req);
        const result = handleUninstallAdapter(webhookCtx, body);
        return this.reply(res, result.status, result.body);
      }

      // ── Workflow templates ──────────────────────────────────
      if (method === "GET" && path === "/api/templates") {
        return this.reply(res, 200, { templates: listTemplates() });
      }

      const templateMatch = path.match(/^\/api\/templates\/([^/]+)(?:\/(load))?$/);
      if (templateMatch) {
        const templateId = decodeURIComponent(templateMatch[1]!);
        const tmpl = getTemplateById(templateId);
        if (!tmpl) return this.reply(res, 404, { error: "Template not found" });
        if (method === "GET" || (method === "POST" && templateMatch[2] === "load")) {
          return this.reply(res, 200, { template: tmpl });
        }
      }

      return this.reply(res, 404, { error: "Not found" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = (err as any)?.statusCode ?? 500;
      if (status >= 500) this.logger?.warn?.(`consensus-tools server error: ${msg}`);
      try { await this.engine.recordError?.(msg, { path: req.url, method: req.method }); } catch { /* ignore */ }
      return this.reply(res, status, { error: msg });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseBody<T>(schema: { safeParse(data: unknown): { success: true; data: T } | { success: false; error: { issues: unknown[] } } }, body: Record<string, unknown>, res: http.ServerResponse): T | null {
    const result = schema.safeParse(body);
    if (!result.success) {
      this.reply(res, 400, { error: "Validation failed", details: result.error.issues });
      return null;
    }
    return result.data;
  }

  private async readJson(req: http.IncomingMessage): Promise<Record<string, any>> {
    const raw = await this.readRaw(req);
    const text = raw.toString("utf8");
    if (!text) return {};
    try { return JSON.parse(text); }
    catch { throw Object.assign(new Error("Invalid JSON body"), { statusCode: 400 }); }
  }

  private async readRaw(req: http.IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk as Buffer));
      if (Buffer.concat(chunks).length > MAX_BODY) throw new Error("Payload too large");
    }
    return Buffer.concat(chunks);
  }

  private reply(res: http.ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }

  private aggregateConsensusVotes(
    votes: ConsensusVote[],
    boardId: string,
    state: import("@consensus-tools/schemas").StorageState,
  ) {
    const policyAssignment = state.policyAssignments.find((p) => p.boardId === boardId);
    const quorum = policyAssignment?.quorum ?? 0.6;
    const weightingMode = policyAssignment?.weightingMode ?? "hybrid";

    const participantMap = new Map(state.participants.filter((p) => p.boardId === boardId).map((p) => [p.id, p]));
    const weighted = votes.map((v) => {
      const p = participantMap.get(v.participantId);
      return {
        evaluator: v.participantId,
        vote: v.decision as "YES" | "NO" | "REWRITE",
        reason: v.rationale,
        risk: 1 - v.confidence,
        weight: p?.weight ?? 1,
        confidence: v.confidence,
        reputation: p?.reputation ?? 50,
      };
    });

    const tally = tallyVotes(weighted, weightingMode);
    const rawTotalWeight = weighted.reduce((sum, v) => sum + v.weight, 0);
    const yesRatio = tally.totalWeight > 0 ? tally.weightedYes / tally.totalWeight : 0;
    return {
      totalWeight: Math.round(tally.totalWeight * 1000) / 1000,
      rawTotalWeight: Math.round(rawTotalWeight * 1000) / 1000,
      yesWeight: Math.round(tally.weightedYes * 1000) / 1000,
      ratio: Math.round(yesRatio * 1000) / 1000,
      passed: yesRatio >= quorum,
      quorum,
      voterCount: tally.voterCount,
      yes: tally.yes,
      no: tally.no,
      rewrite: tally.rewrite,
    };
  }
}
