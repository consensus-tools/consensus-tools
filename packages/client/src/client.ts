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
  manualWinnerAgentIds?: string[];
  manualSubmissionId?: string;
}

export interface ClientOptions {
  baseUrl: string;
  accessToken: string;
  logger?: { warn?: (...args: unknown[]) => void };
}

export class ConsensusToolsClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly logger?: { warn?: (...args: unknown[]) => void };

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl;
    this.accessToken = opts.accessToken;
    this.logger = opts.logger;
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

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger?.warn?.(`consensus-tools: network request failed (status=${res.status}, path=${path})`);
      throw new Error(`Network error ${res.status}: ${text || res.statusText}`);
    }

    const text = await res.text();
    if (!text) return null as T;
    return JSON.parse(text) as T;
  }
}
