import type { Assignment, Job, Resolution, Submission, Vote } from '../types';
import type { JobPostInput, ClaimInput, SubmitInput, ResolveInput, VoteInput } from '../jobs/engine';

export class ConsensusToolsClient {
  constructor(private readonly baseUrl: string, private readonly accessToken: string, private readonly logger?: any) {}

  async postJob(agentId: string, input: JobPostInput): Promise<Job> {
    return this.request('POST', '/jobs', { agentId, ...input });
  }

  async listJobs(params: Record<string, string | undefined> = {}): Promise<Job[]> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    const suffix = query.toString() ? `?${query}` : '';
    return this.request('GET', `/jobs${suffix}`);
  }

  async getJob(jobId: string): Promise<Job> {
    return this.request('GET', `/jobs/${jobId}`);
  }

  async getStatus(jobId: string): Promise<any> {
    return this.request('GET', `/jobs/${jobId}/status`);
  }

  async claimJob(agentId: string, jobId: string, input: ClaimInput): Promise<Assignment> {
    return this.request('POST', `/jobs/${jobId}/claim`, { agentId, ...input });
  }

  async submitJob(agentId: string, jobId: string, input: SubmitInput): Promise<Submission> {
    return this.request('POST', `/jobs/${jobId}/submit`, { agentId, ...input });
  }

  async vote(agentId: string, jobId: string, input: VoteInput): Promise<Vote> {
    return this.request('POST', `/jobs/${jobId}/vote`, { agentId, ...input });
  }

  async resolveJob(agentId: string, jobId: string, input: ResolveInput): Promise<Resolution> {
    return this.request('POST', `/jobs/${jobId}/resolve`, { agentId, ...input });
  }

  async getLedger(agentId: string): Promise<{ agentId: string; balance: number }>
  {
    return this.request('GET', `/ledger/${agentId}`);
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${path}`;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger?.warn?.({ status: res.status, path }, 'consensus-tools: network request failed');
      throw new Error(`Network error ${res.status}: ${text || res.statusText}`);
    }

    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  }
}
