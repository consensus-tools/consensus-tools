import type { ConsensusToolsConfig, Job } from "@consensus-tools/schemas";

export interface ConsensusToolsBackend {
  postJob(actorId: string, input: Record<string, unknown>): Promise<Job>;
  listJobs(filters?: Record<string, string | undefined>): Promise<Job[]>;
  getJob(jobId: string): Promise<Job | undefined>;
  getStatus(jobId: string): Promise<Record<string, unknown>>;
  claimJob(actorId: string, jobId: string, stakeAmount: number, leaseSeconds: number): Promise<unknown>;
  submitJob(actorId: string, jobId: string, input: Record<string, unknown>): Promise<unknown>;
  vote(actorId: string, jobId: string, input: Record<string, unknown>): Promise<unknown>;
  resolveJob(actorId: string, jobId: string, input: Record<string, unknown>): Promise<unknown>;
  getLedgerBalance(target: string): Promise<number>;
  faucet(target: string, amount: number): Promise<unknown>;
  heartbeat(actorId: string, jobId: string): Promise<void>;
  getDiagnostics(): Promise<{ errors: unknown[]; networkOk?: boolean }>;
  startServer(): Promise<void>;
  stopServer(): Promise<void>;
}

export function registerTools(
  api: Record<string, any>,
  backend: ConsensusToolsBackend,
  config: ConsensusToolsConfig,
  agentId: string,
): void {
  const optional = config.safety.requireOptionalToolsOptIn;
  const register = (tool: Record<string, unknown>, opts?: Record<string, unknown>) => api.registerTool(tool, opts);

  register(
    {
      name: "consensus-tools_post_job",
      description: "Post a new consensus job to the consensus-tools job board",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          mode: { type: "string" },
          reward: { type: "number" },
          stakeRequired: { type: "number" },
          maxParticipants: { type: "number" },
          expiresSeconds: { type: "number" },
          tags: { type: "array", items: { type: "string" } },
          constraints: { type: "object" },
          policies: { type: "object" },
        },
        required: ["title", "description"],
      },
      execute: async (args: Record<string, unknown>) => {
        const job = await backend.postJob(agentId, args);
        return { content: [{ type: "text", text: JSON.stringify(job, null, 2) }] };
      },
    },
    { optional },
  );

  register(
    {
      name: "consensus-tools_list_jobs",
      description: "List jobs on the consensus-tools job board",
      parameters: { type: "object", additionalProperties: false, properties: { filters: { type: "object" } } },
      execute: async (args: Record<string, unknown>) => {
        const jobs = await backend.listJobs((args.filters as Record<string, string>) || {});
        return { content: [{ type: "text", text: JSON.stringify(jobs, null, 2) }] };
      },
    },
    { optional: false },
  );

  register(
    {
      name: "consensus-tools_submit",
      description: "Submit job artifacts",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          jobId: { type: "string" },
          summary: { type: "string" },
          artifacts: { type: "object" },
          confidence: { type: "number" },
        },
        required: ["jobId", "summary"],
      },
      execute: async (args: Record<string, unknown>) => {
        const submission = await backend.submitJob(agentId, args.jobId as string, {
          summary: args.summary,
          artifacts: args.artifacts,
          confidence: args.confidence ?? 0.5,
        });
        return { content: [{ type: "text", text: JSON.stringify(submission, null, 2) }] };
      },
    },
    { optional },
  );

  register(
    {
      name: "consensus-tools_vote",
      description: "Vote on a job target",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          jobId: { type: "string" },
          submissionId: { type: "string" },
          score: { type: "number" },
          weight: { type: "number" },
          rationale: { type: "string" },
        },
        required: ["jobId"],
      },
      execute: async (args: Record<string, unknown>) => {
        const vote = await backend.vote(agentId, args.jobId as string, {
          submissionId: args.submissionId,
          score: args.score ?? args.weight,
          weight: args.weight ?? args.score,
          rationale: args.rationale,
        });
        return { content: [{ type: "text", text: JSON.stringify(vote, null, 2) }] };
      },
    },
    { optional },
  );

  register(
    {
      name: "consensus-tools_status",
      description: "Get job status, claims, submissions, and resolution",
      parameters: { type: "object", additionalProperties: false, properties: { jobId: { type: "string" } }, required: ["jobId"] },
      execute: async (args: Record<string, unknown>) => {
        const status = await backend.getStatus(args.jobId as string);
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
      },
    },
    { optional: false },
  );
}
