import http from "node:http";
import crypto from "node:crypto";
import type { ConsensusToolsConfig, GuardEvaluateInput, Participant, AgentConfig, Workflow, WorkflowRun, CronSchedule } from "@consensus-tools/schemas";
import { parseHumanApprovalYesNo } from "@consensus-tools/schemas";
import type {
  JobEngine, JobPostInput, ClaimInput, SubmitInput, LedgerEngine,
  IStorage, AgentRegistry, GuardEngine, HitlTracker,
} from "@consensus-tools/core";
import { newId, nowIso } from "@consensus-tools/core";

/** Minimal interface so we don't need a hard dep on @consensus-tools/workflows at compile time. */
export interface WorkflowRunner {
  createWorkflow(name: string, definition: Record<string, unknown>, templateId?: string): Promise<Workflow>;
  listWorkflows(): Promise<Workflow[]>;
  run(workflowId: string): Promise<WorkflowRun>;
}

export interface CronScheduler {
  register(workflowId: string, cronExpression: string): Promise<CronSchedule>;
  unregister(workflowId: string): Promise<boolean>;
  list(): Promise<CronSchedule[]>;
}

const MAX_BODY = 1024 * 1024;

export interface ServerDeps {
  config: ConsensusToolsConfig;
  engine: JobEngine;
  ledger: LedgerEngine;
  storage: IStorage;
  agentRegistry?: AgentRegistry;
  guardEngine?: GuardEngine;
  hitlTracker?: HitlTracker;
  workflowRunner?: WorkflowRunner;
  cronScheduler?: CronScheduler;
  logger?: { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void };
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
    this.logger = deps.logger;
  }

  async start(): Promise<void> {
    if (this.server) return;
    const { host, port } = this.config.local.server;
    this.server = http.createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => {
      this.server?.listen(port, host, () => resolve());
    });
    this.logger?.info?.(`consensus-tools server started (${host}:${port})`);
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
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-agent-key");
    if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

    try {
      if (this.config.local.server.authToken) {
        const auth = req.headers.authorization || "";
        if (auth !== `Bearer ${this.config.local.server.authToken}`) {
          return this.reply(res, 401, { error: "Unauthorized" });
        }
      }

      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const path = url.pathname;
      const method = req.method || "GET";

      // ── Job routes (existing) ───────────────────────────────
      if (method === "POST" && path === "/jobs") {
        const body = await this.readJson(req);
        const job = await this.engine.postJob(body.agentId, body as JobPostInput);
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
          return this.reply(res, 200, await this.engine.claimJob(body.agentId, jobId, body as ClaimInput));
        }
        if (method === "POST" && action === "submit") {
          const body = await this.readJson(req);
          return this.reply(res, 200, await this.engine.submitJob(body.agentId, jobId, body as SubmitInput));
        }
        if (method === "POST" && action === "vote") {
          const body = await this.readJson(req);
          return this.reply(res, 200, await this.engine.vote(body.agentId, jobId, body));
        }
        if (method === "POST" && action === "resolve") {
          const body = await this.readJson(req);
          return this.reply(res, 200, await this.engine.resolveJob(body.agentId, jobId, body));
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
        const input: GuardEvaluateInput = {
          boardId: body.boardId ?? "default",
          agentId: body.agentId,
          action: body.action ?? { type: body.type ?? "agent_action", payload: body.payload ?? body },
        };
        const result = await this.guardEngine.evaluate(input, body.policy);
        return this.reply(res, 200, result);
      }

      // ── Human approval (HITL) ───────────────────────────────
      if (method === "POST" && path === "/api/human.approve") {
        if (!this.hitlTracker) return this.reply(res, 501, { error: "HITL tracker not configured" });
        const body = await this.readJson(req);
        const parsed = parseHumanApprovalYesNo(body.decision ?? body.vote ?? "");
        if (!parsed) return this.reply(res, 400, { error: "Invalid decision — expected YES, NO, or REWRITE" });
        await this.hitlTracker.recordVoteReceived(body.runId);
        return this.reply(res, 200, { ok: true, decision: parsed, runId: body.runId });
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
          const agent = await this.agentRegistry.createAgent(body as AgentConfig);
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
          return this.reply(res, 200, participants);
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

      // ── Workflow management ─────────────────────────────────
      if (path === "/api/workflows") {
        if (!this.workflowRunner) return this.reply(res, 501, { error: "Workflow runner not configured" });
        if (method === "GET") {
          return this.reply(res, 200, await this.workflowRunner.listWorkflows());
        }
        if (method === "POST") {
          const body = await this.readJson(req);
          const workflow = await this.workflowRunner.createWorkflow(
            body.name, body.definition ?? {}, body.templateId,
          );
          return this.reply(res, 201, workflow);
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
      if (method === "GET" && workflowIdMatch) {
        if (!this.workflowRunner) return this.reply(res, 501, { error: "Workflow runner not configured" });
        const wfId = decodeURIComponent(workflowIdMatch[1]!);
        const state = await this.storage.getState();
        const workflow = state.workflows.find((w) => w.id === wfId);
        if (!workflow) return this.reply(res, 404, { error: "Workflow not found" });
        const runs = state.workflowRuns.filter((r) => r.workflowId === wfId);
        return this.reply(res, 200, { ...workflow, runs });
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
          const schedule = await this.cronScheduler.register(wfId, body.cronExpression);
          return this.reply(res, 201, schedule);
        }
        if (method === "DELETE") {
          await this.cronScheduler.unregister(wfId);
          return this.reply(res, 200, { ok: true });
        }
      }

      // ── Board / run / audit queries ─────────────────────────
      if (method === "GET" && path === "/api/mcp/boards") {
        const state = await this.storage.getState();
        // Derive boards from distinct boardId values across jobs
        const boardIds = [...new Set(state.jobs.map((j) => j.boardId).filter(Boolean))];
        const boards = boardIds.map((id) => ({
          id,
          jobs: state.jobs.filter((j) => j.boardId === id).length,
        }));
        return this.reply(res, 200, boards);
      }

      const boardIdMatch = path.match(/^\/api\/mcp\/boards\/([^/]+)$/);
      if (method === "GET" && boardIdMatch) {
        const boardId = decodeURIComponent(boardIdMatch[1]!);
        const state = await this.storage.getState();
        const runs = state.jobs.filter((j) => j.boardId === boardId);
        if (runs.length === 0) return this.reply(res, 404, { error: "Board not found" });
        return this.reply(res, 200, { id: boardId, runs });
      }

      const runIdMatch = path.match(/^\/api\/mcp\/runs\/([^/]+)$/);
      if (method === "GET" && runIdMatch) {
        const runId = decodeURIComponent(runIdMatch[1]!);
        const state = await this.storage.getState();
        const job = state.jobs.find((j) => j.id === runId);
        if (!job) return this.reply(res, 404, { error: "Run not found" });
        const events = state.audit.filter((e) =>
          (e.details as Record<string, unknown>)?.runId === runId
          || (e.details as Record<string, unknown>)?.jobId === runId
        );
        return this.reply(res, 200, { ...job, events });
      }

      if (method === "GET" && path === "/api/mcp/events") {
        const state = await this.storage.getState();
        const boardId = url.searchParams.get("boardId");
        const runId = url.searchParams.get("runId");
        const type = url.searchParams.get("type");
        const limit = parseInt(url.searchParams.get("limit") || "100", 10);
        let events = state.audit;
        if (boardId) events = events.filter((e) => (e.details as Record<string, unknown>)?.boardId === boardId);
        if (runId) events = events.filter((e) => (e.details as Record<string, unknown>)?.runId === runId);
        if (type) events = events.filter((e) => e.type === type);
        return this.reply(res, 200, events.slice(-limit));
      }

      if (method === "GET" && path === "/api/mcp/audit/search") {
        const state = await this.storage.getState();
        const q = url.searchParams.get("q") || "";
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        const results = q
          ? state.audit.filter((e) => JSON.stringify(e).toLowerCase().includes(q.toLowerCase()))
          : state.audit;
        return this.reply(res, 200, results.slice(-limit));
      }

      if (method === "GET" && path === "/api/mcp/tools") {
        const tools = [
          "guard.evaluate", "guard.send_email", "guard.code_merge", "guard.publish",
          "guard.support_reply", "guard.agent_action", "guard.deployment", "guard.permission_escalation",
          "agent.register", "agent.list", "agent.suspend", "agent.activate",
          "consensus_post_job", "consensus_list_jobs", "consensus_submit", "consensus_vote", "consensus_status",
          "human.approve", "board.list", "board.get", "run.get", "audit.search",
          "workflow.create", "workflow.run", "workflow.list", "cron.register", "cron.list",
        ];
        return this.reply(res, 200, { tools });
      }

      // ── GitHub webhook ──────────────────────────────────────
      if (method === "POST" && path === "/api/webhooks/github") {
        const rawBody = await this.readRaw(req);
        const signature = (req.headers["x-hub-signature-256"] ?? "") as string;
        const secret = (this.config as any).github?.webhookSecret;
        if (secret && !this.verifyGithubSignature(rawBody, signature, secret)) {
          return this.reply(res, 401, { error: "Invalid signature" });
        }
        const payload = JSON.parse(rawBody.toString("utf8"));
        await this.storage.update((state) => {
          state.audit.push({
            id: newId("audit"),
            at: nowIso(),
            type: "WEBHOOK_GITHUB",
            details: { action: payload.action, event: req.headers["x-github-event"] },
          });
        });
        return this.reply(res, 200, { ok: true });
      }

      return this.reply(res, 404, { error: "Not found" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.warn?.(`consensus-tools server error: ${msg}`);
      try { await this.engine.recordError?.(msg, { path: req.url, method: req.method }); } catch { /* ignore */ }
      return this.reply(res, 500, { error: msg });
    }
  }

  private async readJson(req: http.IncomingMessage): Promise<Record<string, any>> {
    const raw = await this.readRaw(req);
    const text = raw.toString("utf8");
    return text ? JSON.parse(text) : {};
  }

  private async readRaw(req: http.IncomingMessage): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk as Buffer));
      if (Buffer.concat(chunks).length > MAX_BODY) throw new Error("Payload too large");
    }
    return Buffer.concat(chunks);
  }

  private verifyGithubSignature(body: Buffer, signature: string, secret: string): boolean {
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  private reply(res: http.ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }
}
