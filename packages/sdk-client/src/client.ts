import type { Job, Submission, Vote, Resolution, Assignment } from "@consensus-tools/schemas";

export interface JobPostInput {
  title: string;
  description: string;
  mode?: string;
  reward?: number;
  stakeRequired?: number;
  expiresSeconds?: number;
  constraints?: Record<string, unknown>;
  consensusPolicy?: Record<string, unknown>;
}

export interface ClaimInput {
  bid?: number;
  stake?: number;
}

export interface SubmitInput {
  artifacts: Record<string, unknown>;
  confidence: number;
}

export interface VoteInput {
  submissionId: string;
  score: number;
  weight?: number;
  rationale?: string;
}

export interface ResolveInput {
  manualWinners?: string[];
  manualSubmissionId?: string;
}

export interface ClientOptions {
  baseUrl: string;
  accessToken: string;
  logger?: { warn?: (...args: unknown[]) => void };
  retry?: { maxAttempts?: number; backoffMs?: number };
  timeout?: number;
}

export class ConsensusToolsClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly logger?: { warn?: (...args: unknown[]) => void };
  private readonly retryConfig: { maxAttempts: number; backoffMs: number };
  private readonly timeout: number;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.accessToken = opts.accessToken;
    this.logger = opts.logger;
    this.retryConfig = {
      maxAttempts: opts.retry?.maxAttempts ?? 3,
      backoffMs: opts.retry?.backoffMs ?? 200,
    };
    this.timeout = opts.timeout ?? 30_000;
  }

  async postJob(agentId: string, input: JobPostInput): Promise<Job> {
    return this.request("POST", "/jobs", { agentId, ...input });
  }

  async listJobs(params: Record<string, string | undefined> = {}): Promise<Job[]> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    const suffix = query.toString() ? `?${query}` : "";
    return this.request("GET", `/jobs${suffix}`);
  }

  async getJob(jobId: string): Promise<Job> {
    return this.request("GET", `/jobs/${encodeURIComponent(jobId)}`);
  }

  async getStatus(jobId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/jobs/${encodeURIComponent(jobId)}/status`);
  }

  async claimJob(agentId: string, jobId: string, input: ClaimInput): Promise<Assignment> {
    return this.request("POST", `/jobs/${encodeURIComponent(jobId)}/claim`, { agentId, ...input });
  }

  async submitJob(agentId: string, jobId: string, input: SubmitInput): Promise<Submission> {
    return this.request("POST", `/jobs/${encodeURIComponent(jobId)}/submit`, { agentId, ...input });
  }

  async vote(agentId: string, jobId: string, input: VoteInput): Promise<Vote> {
    return this.request("POST", `/jobs/${encodeURIComponent(jobId)}/vote`, { agentId, ...input });
  }

  async resolveJob(agentId: string, jobId: string, input: ResolveInput): Promise<Resolution> {
    return this.request("POST", `/jobs/${encodeURIComponent(jobId)}/resolve`, { agentId, ...input });
  }

  async getLedger(agentId: string): Promise<{ agentId: string; balance: number }> {
    return this.request("GET", `/ledger/${encodeURIComponent(agentId)}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        const res = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          const text = await res.text();
          // Don't retry 4xx — these are client errors
          if (res.status >= 400 && res.status < 500) {
            throw new Error(`Client error ${res.status}: ${text || res.statusText}`);
          }
          // 5xx: retry
          lastError = new Error(`Server error ${res.status}: ${text || res.statusText}`);
          this.logger?.warn?.(`consensus-tools: request failed (status=${res.status}, attempt=${attempt}/${this.retryConfig.maxAttempts})`);
        } else {
          const text = await res.text();
          if (!text) return null as T;
          return JSON.parse(text) as T;
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Client error")) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        this.logger?.warn?.(`consensus-tools: request failed (attempt=${attempt}/${this.retryConfig.maxAttempts}): ${lastError.message}`);
      }

      // Exponential backoff before retry
      if (attempt < this.retryConfig.maxAttempts) {
        const delay = this.retryConfig.backoffMs * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }
}
