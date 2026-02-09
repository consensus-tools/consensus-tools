import type { ConsensusToolsConfig } from './types';
import type { ConsensusToolsBackendCli } from './cli';

export function registerTools(api: any, backend: ConsensusToolsBackendCli, config: ConsensusToolsConfig, agentId: string) {
  const optional = config.safety.requireOptionalToolsOptIn;

  const register = (tool: any, opts?: any) => api.registerTool(tool, opts);

  register(
    {
      name: 'consensus-tools_post_job',
      description: 'Post a new consensus job to the consensus-tools job board',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          boardId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          desc: { type: 'string' },
          inputRef: { type: 'string' },
          mode: { type: 'string' },
          policyKey: { type: 'string' },
          policyConfigJson: { type: 'object' },
          inputs: { type: 'object' },
          reward: { type: 'number' },
          rewardAmount: { type: 'number' },
          stakeRequired: { type: 'number' },
          stakeAmount: { type: 'number' },
          currency: { type: 'string' },
          maxParticipants: { type: 'number' },
          minParticipants: { type: 'number' },
          expiresSeconds: { type: 'number' },
          opensAt: { type: 'string' },
          closesAt: { type: 'string' },
          resolvesAt: { type: 'string' },
          priority: { type: 'number' },
          policies: { type: 'object' },
          tags: { type: 'array', items: { type: 'string' } },
          requiredCapabilities: { type: 'array', items: { type: 'string' } },
          constraints: { type: 'object' },
          artifactSchemaJson: { type: 'object' }
        },
        required: ['title', 'description']
      },
      execute: async (args: any) => {
        const job = await backend.postJob(agentId, {
          boardId: args.boardId,
          title: args.title,
          description: args.description,
          desc: args.desc,
          inputRef: args.inputRef,
          mode: args.mode,
          policyKey: args.policyKey,
          policyConfigJson: args.policyConfigJson,
          inputs: args.inputs,
          reward: args.reward,
          rewardAmount: args.rewardAmount,
          stakeRequired: args.stakeRequired,
          stakeAmount: args.stakeAmount,
          currency: args.currency,
          maxParticipants: args.maxParticipants,
          minParticipants: args.minParticipants,
          expiresSeconds: args.expiresSeconds,
          opensAt: args.opensAt,
          closesAt: args.closesAt,
          resolvesAt: args.resolvesAt,
          priority: args.priority,
          tags: args.tags,
          requiredCapabilities: args.requiredCapabilities,
          constraints: args.constraints,
          artifactSchemaJson: args.artifactSchemaJson,
          consensusPolicy: args.policies?.consensusPolicy,
          slashingPolicy: args.policies?.slashingPolicy
        });
        return { content: [{ type: 'text', text: JSON.stringify(job, null, 2) }] };
      }
    },
    { optional }
  );

  register(
    {
      name: 'consensus-tools_list_jobs',
      description: 'List jobs on the consensus-tools job board',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          filters: { type: 'object' }
        }
      },
      execute: async (args: any) => {
        const jobs = await backend.listJobs(args.filters || {});
        return { content: [{ type: 'text', text: JSON.stringify(jobs, null, 2) }] };
      }
    },
    { optional: false }
  );

  register(
    {
      name: 'consensus-tools_submit',
      description: 'Submit job artifacts',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          jobId: { type: 'string' },
          summary: { type: 'string' },
          artifacts: { type: 'object' },
          artifactRef: { type: 'string' },
          confidence: { type: 'number' },
          requestedPayout: { type: 'number' }
        },
        required: ['jobId', 'summary']
      },
      execute: async (args: any) => {
        const submission = await backend.submitJob(agentId, args.jobId, {
          summary: args.summary,
          artifacts: args.artifacts,
          artifactRef: args.artifactRef,
          confidence: args.confidence ?? 0.5,
          requestedPayout: args.requestedPayout
        });
        return { content: [{ type: 'text', text: JSON.stringify(submission, null, 2) }] };
      }
    },
    { optional }
  );

  register(
    {
      name: 'consensus-tools_vote',
      description: 'Vote on a job target',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          jobId: { type: 'string' },
          submissionId: { type: 'string' },
          choiceKey: { type: 'string' },
          weight: { type: 'number' },
          score: { type: 'number' },
          stakeAmount: { type: 'number' },
          rationale: { type: 'string' }
        },
        required: ['jobId']
      },
      execute: async (args: any) => {
        const vote = await backend.vote(agentId, args.jobId, {
          submissionId: args.submissionId,
          choiceKey: args.choiceKey,
          weight: args.weight ?? args.score,
          score: args.score ?? args.weight,
          stakeAmount: args.stakeAmount,
          rationale: args.rationale
        });
        return { content: [{ type: 'text', text: JSON.stringify(vote, null, 2) }] };
      }
    },
    { optional }
  );

  register(
    {
      name: 'consensus-tools_status',
      description: 'Get job status, claims, submissions, and resolution',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          jobId: { type: 'string' }
        },
        required: ['jobId']
      },
      execute: async (args: any) => {
        const status = backend.getStatus ? await backend.getStatus(args.jobId) : await backend.getJob(args.jobId);
        return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
      }
    },
    { optional: false }
  );
}
