import http from 'node:http';
import type { ConsensusToolsConfig } from '../types';
import type { JobEngine } from '../jobs/engine';
import type { LedgerEngine } from '../ledger/ledger';

export class ConsensusToolsServer {
  private server?: http.Server;

  constructor(
    private readonly config: ConsensusToolsConfig,
    private readonly engine: JobEngine,
    private readonly ledger: LedgerEngine,
    private readonly logger?: any
  ) {}

  async start(): Promise<void> {
    if (this.server) return;
    const { host, port } = this.config.local.server;
    this.server = http.createServer((req, res) => this.handle(req, res));

    await new Promise<void>((resolve) => {
      this.server?.listen(port, host, () => resolve());
    });

    this.logger?.info?.({ host, port }, 'consensus-tools embedded server started');
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const srv = this.server;
    this.server = undefined;
    await new Promise<void>((resolve, reject) => {
      srv.close((err) => (err ? reject(err) : resolve()));
    });
    this.logger?.info?.('consensus-tools embedded server stopped');
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      if (this.config.local.server.authToken) {
        const auth = req.headers.authorization || '';
        if (auth !== `Bearer ${this.config.local.server.authToken}`) {
          return this.reply(res, 401, { error: 'Unauthorized' });
        }
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const path = url.pathname;
      const method = req.method || 'GET';

      if (method === 'POST' && path === '/jobs') {
        const body = await this.readJson(req);
        const job = await this.engine.postJob(body.agentId, body);
        return this.reply(res, 200, job);
      }

      if (method === 'GET' && path === '/jobs') {
        const jobs = await this.engine.listJobs({
          status: url.searchParams.get('status') || undefined,
          tag: url.searchParams.get('tag') || undefined,
          mine: url.searchParams.get('mine') || undefined
        });
        return this.reply(res, 200, jobs);
      }

      const jobMatch = path.match(/^\/jobs\/([^/]+)(?:\/(claim|submit|vote|resolve|status))?$/);
      if (jobMatch) {
        const jobId = jobMatch[1];
        const action = jobMatch[2];

        if (method === 'GET' && !action) {
          const job = await this.engine.getJob(jobId);
          if (!job) return this.reply(res, 404, { error: 'Job not found' });
          return this.reply(res, 200, job);
        }

        if (method === 'GET' && action === 'status') {
          const status = await this.engine.getStatus(jobId);
          return this.reply(res, 200, status);
        }

        if (method === 'POST' && action === 'claim') {
          const body = await this.readJson(req);
          const claim = await this.engine.claimJob(body.agentId, jobId, body);
          return this.reply(res, 200, claim);
        }

        if (method === 'POST' && action === 'submit') {
          const body = await this.readJson(req);
          const submission = await this.engine.submitJob(body.agentId, jobId, body);
          return this.reply(res, 200, submission);
        }

        if (method === 'POST' && action === 'vote') {
          const body = await this.readJson(req);
          const vote = await this.engine.vote(body.agentId, jobId, body);
          return this.reply(res, 200, vote);
        }

        if (method === 'POST' && action === 'resolve') {
          const body = await this.readJson(req);
          const resolution = await this.engine.resolveJob(body.agentId, jobId, body);
          return this.reply(res, 200, resolution);
        }
      }

      const ledgerMatch = path.match(/^\/ledger\/([^/]+)$/);
      if (method === 'GET' && ledgerMatch) {
        const agentId = ledgerMatch[1];
        const balance = await this.ledger.getBalance(agentId);
        return this.reply(res, 200, { agentId, balance });
      }

      return this.reply(res, 404, { error: 'Not found' });
    } catch (err: any) {
      this.logger?.warn?.({ err }, 'consensus-tools server error');
      try {
        await this.engine.recordError?.(err?.message || 'Server error', { path: req.url, method: req.method });
      } catch {
        // ignore
      }
      return this.reply(res, 500, { error: err?.message || 'Server error' });
    }
  }

  private async readJson(req: http.IncomingMessage): Promise<any> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
      if (Buffer.concat(chunks).length > 1024 * 1024) {
        throw new Error('Payload too large');
      }
    }
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : {};
  }

  private reply(res: http.ServerResponse, status: number, body: any): void {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  }
}
