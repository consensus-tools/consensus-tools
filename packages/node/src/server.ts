import http from "node:http";
import type { ConsensusToolsConfig } from "@consensus-tools/schemas";
import type { JobEngine, JobPostInput, ClaimInput, SubmitInput, LedgerEngine } from "@consensus-tools/core";

const MAX_BODY = 1024 * 1024;

export class ConsensusToolsServer {
  private server?: http.Server;

  constructor(
    private readonly config: ConsensusToolsConfig,
    private readonly engine: JobEngine,
    private readonly ledger: LedgerEngine,
    private readonly logger?: { info?: (...a: unknown[]) => void; warn?: (...a: unknown[]) => void },
  ) {}

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

      return this.reply(res, 404, { error: "Not found" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger?.warn?.(`consensus-tools server error: ${msg}`);
      try { await this.engine.recordError?.(msg, { path: req.url, method: req.method }); } catch { /* ignore */ }
      return this.reply(res, 500, { error: msg });
    }
  }

  private async readJson(req: http.IncomingMessage): Promise<Record<string, any>> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk as Buffer));
      if (Buffer.concat(chunks).length > MAX_BODY) throw new Error("Payload too large");
    }
    const text = Buffer.concat(chunks).toString("utf8");
    return text ? JSON.parse(text) : {};
  }

  private reply(res: http.ServerResponse, status: number, body: unknown): void {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  }
}
