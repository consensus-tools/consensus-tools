import type {
  ConsensusToolsConfig,
  Assignment,
  Bid,
  Job,
  Resolution,
  Submission,
  Vote,
  ConsensusPolicyConfig,
  SlashingPolicy
} from '../types';
import type { IStorage } from '../storage/IStorage';
import { newId } from '../util/ids';
import { addSeconds, nowIso, isPast } from '../util/time';
import { resolveConsensus } from './consensus';
import { calculateSlashAmount } from './slashing';
import { LedgerEngine } from '../ledger/ledger';
import { ensureNonNegative, getBalance } from '../ledger/rules';

export interface JobFilters {
  status?: string;
  tag?: string;
  mine?: string;
}

export interface JobPostInput {
  title: string;
  description?: string;
  desc?: string;
  inputRef?: string;
  inputs?: Record<string, unknown>;
  mode?: 'SUBMISSION' | 'VOTING';
  policyKey?: string;
  policyConfigJson?: Record<string, unknown>;
  rewardAmount?: number;
  stakeAmount?: number;
  currency?: string;
  opensAt?: string;
  closesAt?: string;
  resolvesAt?: string;
  artifactSchemaJson?: Record<string, unknown>;
  boardId?: string;
  reward?: number;
  tags?: string[];
  priority?: number;
  requiredCapabilities?: string[];
  constraints?: { timeSeconds?: number; budget?: number };
  maxParticipants?: number;
  minParticipants?: number;
  consensusPolicy?: ConsensusPolicyConfig;
  slashingPolicy?: SlashingPolicy;
  expiresSeconds?: number;
  stakeRequired?: number;
}

export interface ClaimInput {
  stakeAmount: number;
  leaseSeconds: number;
}

export interface SubmitInput {
  summary: string;
  artifacts?: Record<string, unknown>;
  artifactRef?: string;
  confidence: number;
  requestedPayout?: number;
}

export interface VoteInput {
  submissionId?: string;
  targetType?: 'SUBMISSION' | 'CHOICE';
  targetId?: string;
  choiceKey?: string;
  weight?: number;
  stakeAmount?: number;
  score?: number;
  rationale?: string;
}

export interface ResolveInput {
  manualWinners?: string[];
  manualSubmissionId?: string;
}

export class JobEngine {
  constructor(
    private readonly storage: IStorage,
    private readonly ledger: LedgerEngine,
    private readonly config: ConsensusToolsConfig,
    private readonly logger?: any
  ) {}

  async postJob(agentId: string, input: JobPostInput): Promise<Job> {
    const now = nowIso();
    const description = input.description ?? input.desc ?? '';
    const policyFromKey = input.policyKey ? this.config.local.consensusPolicies?.[input.policyKey] : undefined;
    const policyFromJson = (input.policyConfigJson ?? {}) as Partial<ConsensusPolicyConfig>;
    const consensusPolicy: ConsensusPolicyConfig = {
      ...this.config.local.jobDefaults.consensusPolicy,
      ...(policyFromKey ?? {}),
      ...policyFromJson,
      ...(input.consensusPolicy ?? {})
    };
    const job: Job = {
      id: newId('job'),
      boardId: input.boardId,
      creatorPrincipalId: agentId,
      title: input.title,
      desc: input.desc ?? description,
      description,
      inputRef: input.inputRef,
      createdAt: now,
      expiresAt: addSeconds(now, input.expiresSeconds ?? this.config.local.jobDefaults.expiresSeconds),
      opensAt: input.opensAt ?? now,
      closesAt: input.closesAt ?? addSeconds(now, input.expiresSeconds ?? this.config.local.jobDefaults.expiresSeconds),
      resolvesAt: input.resolvesAt,
      createdByAgentId: agentId,
      mode: input.mode ?? 'SUBMISSION',
      policyKey: input.policyKey,
      policyConfigJson: input.policyConfigJson,
      tags: input.tags ?? [],
      priority: input.priority ?? 0,
      requiredCapabilities: input.requiredCapabilities ?? [],
      inputs: input.inputs ?? {},
      constraints: input.constraints ?? {},
      reward: input.reward ?? input.rewardAmount ?? this.config.local.jobDefaults.reward,
      rewardAmount: input.rewardAmount ?? input.reward ?? this.config.local.jobDefaults.reward,
      stakeRequired: input.stakeRequired ?? input.stakeAmount ?? this.config.local.jobDefaults.stakeRequired,
      stakeAmount: input.stakeAmount ?? input.stakeRequired ?? this.config.local.jobDefaults.stakeRequired,
      currency: input.currency ?? 'CREDITS',
      maxParticipants: input.maxParticipants ?? this.config.local.jobDefaults.maxParticipants,
      minParticipants: input.minParticipants ?? this.config.local.jobDefaults.minParticipants,
      consensusPolicy,
      slashingPolicy: input.slashingPolicy ?? this.config.local.jobDefaults.slashingPolicy,
      escrowPolicy: { type: 'mint' },
      artifactSchemaJson: input.artifactSchemaJson,
      status: 'OPEN'
    };

    await this.storage.update((state) => {
      state.jobs.push(job);
      state.audit.push({
        id: newId('audit'),
        at: now,
        type: 'job_posted',
        jobId: job.id,
        actorAgentId: agentId,
        details: { title: job.title }
      });
    });

    this.logger?.info?.({ jobId: job.id }, 'consensus-tools: job posted');
    return job;
  }

  async listJobs(filters: JobFilters = {}): Promise<Job[]> {
    const state = await this.storage.getState();
    const updated = this.applyExpiry(state);
    if (updated) await this.storage.saveState(state);
    return state.jobs.filter((job) => {
      if (filters.status && job.status !== filters.status) return false;
      if (filters.tag && !job.tags.includes(filters.tag)) return false;
      if (filters.mine && job.createdByAgentId !== filters.mine) return false;
      return true;
    });
  }

  async getJob(jobId: string): Promise<Job | undefined> {
    const state = await this.storage.getState();
    const updated = this.applyExpiry(state);
    if (updated) await this.storage.saveState(state);
    return state.jobs.find((job) => job.id === jobId);
  }

  async getStatus(jobId: string): Promise<{ job?: Job; claims: Assignment[]; submissions: Submission[]; resolution?: Resolution }>
  {
    const state = await this.storage.getState();
    const updated = this.applyExpiry(state);
    if (updated) await this.storage.saveState(state);
    return {
      job: state.jobs.find((job) => job.id === jobId),
      claims: state.claims.filter((claim) => claim.jobId === jobId),
      submissions: state.submissions.filter((sub) => sub.jobId === jobId),
      resolution: state.resolutions.find((res) => res.jobId === jobId)
    };
  }

  async claimJob(agentId: string, jobId: string, input: ClaimInput): Promise<Assignment> {
    await this.ledger.ensureInitialCredits(agentId);
    const now = nowIso();

    return (await this.storage.update((state) => {
      const job = state.jobs.find((j) => j.id === jobId);
      if (!job) throw new Error(`Job not found: ${jobId}`);
      if (job.status === 'RESOLVED' || job.status === 'CANCELLED') {
        throw new Error(`Job is not claimable: ${job.status}`);
      }
      if (isPast(job.expiresAt)) {
        job.status = 'EXPIRED';
        throw new Error('Job has expired');
      }

      const existing = state.claims.find((c) => c.jobId === jobId && c.agentId === agentId && c.status === 'ACTIVE');
      if (existing) throw new Error('Job already claimed by this agent');

      const activeClaims = state.claims.filter((c) => c.jobId === jobId && c.status === 'ACTIVE');
      if (activeClaims.length >= job.maxParticipants) throw new Error('Job is full');

      const stakeAmount = Math.max(input.stakeAmount, job.stakeRequired);
      const currentBalance = getBalance(state.ledger, agentId);
      const nextBalance = currentBalance - Math.abs(stakeAmount);
      ensureNonNegative(nextBalance, `${agentId} stake for ${jobId}`);

      state.ledger.push({
        id: newId('ledger'),
        at: now,
        type: 'STAKE',
        agentId,
        amount: -Math.abs(stakeAmount),
        jobId
      });

      state.bids.push({
        agentId,
        jobId,
        stakeAmount,
        stakeAt: now
      } as Bid);

      const assignment: Assignment = {
        agentId,
        jobId,
        claimAt: now,
        leaseUntil: addSeconds(now, input.leaseSeconds),
        heartbeatAt: now,
        status: 'ACTIVE'
      };

      job.status = 'IN_PROGRESS';
      state.claims.push(assignment);
      state.audit.push({
        id: newId('audit'),
        at: now,
        type: 'job_claimed',
        jobId,
        actorAgentId: agentId,
        details: { stakeAmount }
      });
      return assignment;
    })).result;
  }

  async heartbeat(agentId: string, jobId: string): Promise<void> {
    await this.storage.update((state) => {
      const claim = state.claims.find((c) => c.jobId === jobId && c.agentId === agentId && c.status === 'ACTIVE');
      if (!claim) return;
      claim.heartbeatAt = nowIso();
    });
  }

  async submitJob(agentId: string, jobId: string, input: SubmitInput): Promise<Submission> {
    const now = nowIso();
    return (await this.storage.update((state) => {
      const job = state.jobs.find((j) => j.id === jobId);
      if (!job) throw new Error(`Job not found: ${jobId}`);
      if (job.status === 'RESOLVED' || job.status === 'CANCELLED') throw new Error('Job is closed');

      const submission: Submission = {
        id: newId('sub'),
        boardId: job.boardId,
        submitterPrincipalId: agentId,
        agentId,
        jobId,
        submittedAt: now,
        createdAt: now,
        artifactRef: input.artifactRef,
        artifacts: input.artifacts ?? {},
        summary: input.summary,
        confidence: input.confidence,
        requestedPayout: input.requestedPayout ?? job.reward,
        status: 'SUBMITTED'
      };
      state.submissions.push(submission);
      job.status = 'SUBMITTED';
      state.audit.push({
        id: newId('audit'),
        at: now,
        type: 'job_submitted',
        jobId,
        actorAgentId: agentId,
        details: { submissionId: submission.id }
      });
      return submission;
    })).result;
  }

  async vote(agentId: string, jobId: string, input: VoteInput): Promise<Vote> {
    const now = nowIso();
    return (await this.storage.update((state) => {
      const job = state.jobs.find((j) => j.id === jobId);
      if (!job) throw new Error(`Job not found: ${jobId}`);
      if (
        job.mode === 'SUBMISSION' &&
        (job.consensusPolicy.type === 'SINGLE_WINNER' ||
          job.consensusPolicy.type === 'HIGHEST_CONFIDENCE_SINGLE' ||
          job.consensusPolicy.type === 'OWNER_PICK' ||
          job.consensusPolicy.type === 'TOP_K_SPLIT' ||
          job.consensusPolicy.type === 'TRUSTED_ARBITER')
      ) {
        throw new Error('Voting not enabled for this job');
      }
      const targetType = input.targetType ?? (input.submissionId ? 'SUBMISSION' : input.choiceKey ? 'CHOICE' : undefined);
      const targetId = input.targetId ?? input.submissionId;
      if (targetType === 'SUBMISSION') {
        const submission = state.submissions.find((s) => s.id === targetId && s.jobId === jobId);
        if (!submission) throw new Error('Submission not found');
      }

      const score = input.score ?? input.weight ?? 0;

      const vote: Vote = {
        id: newId('vote'),
        jobId,
        boardId: job.boardId,
        voterPrincipalId: agentId,
        submissionId: input.submissionId ?? (targetType === 'SUBMISSION' ? targetId : undefined),
        targetType,
        targetId,
        choiceKey: input.choiceKey,
        agentId,
        score,
        weight: input.weight ?? score,
        stakeAmount: input.stakeAmount,
        rationale: input.rationale,
        createdAt: now
      };
      state.votes.push(vote);
      state.audit.push({
        id: newId('audit'),
        at: now,
        type: 'job_voted',
        jobId,
        actorAgentId: agentId,
        details: { submissionId: vote.submissionId, score }
      });
      return vote;
    })).result;
  }

  async resolveJob(agentId: string, jobId: string, input: ResolveInput = {}): Promise<Resolution> {
    const now = nowIso();
    return (await this.storage.update((state) => {
      const job = state.jobs.find((j) => j.id === jobId);
      if (!job) throw new Error(`Job not found: ${jobId}`);
      if (job.status === 'RESOLVED') throw new Error('Job already resolved');

      if (job.consensusPolicy.type === 'TRUSTED_ARBITER') {
        const arbiter = job.consensusPolicy.trustedArbiterAgentId;
        if (arbiter && arbiter !== agentId) {
          throw new Error('Only the trusted arbiter can resolve this job');
        }
      }

      if (job.consensusPolicy.type === 'OWNER_PICK' && job.createdByAgentId !== agentId) {
        throw new Error('Only the job creator can resolve this job');
      }

      const submissions = state.submissions.filter((s) => s.jobId === jobId);
      const votes = state.votes.filter((v) => v.jobId === jobId);
      const bids = state.bids.filter((b) => b.jobId === jobId);

      const reputation = (agent: string) => {
        let score = 1;
        for (const entry of state.ledger) {
          if (entry.agentId !== agent) continue;
          if (entry.type === 'PAYOUT') score += entry.amount;
          if (entry.type === 'SLASH') score += entry.amount;
        }
        return Math.max(0.1, score);
      };

      const consensus = resolveConsensus({
        job,
        submissions,
        votes,
        reputation,
        manualWinnerAgentIds: input.manualWinners,
        manualSubmissionId: input.manualSubmissionId
      });

      const payouts: Array<{ agentId: string; amount: number }> = [];
      const slashes: Array<{ agentId: string; amount: number; reason: string }> = [];

      if (consensus.winners.length) {
        const amountPerWinner = job.reward / consensus.winners.length;
        for (const winner of consensus.winners) {
          payouts.push({ agentId: winner, amount: amountPerWinner });
        }
      }

      const submissionAgents = new Set(submissions.map((s) => s.agentId));
      for (const bid of bids) {
        const stakeAmount = bid.stakeAmount;
        let slashAmount = 0;
        let reason = '';
        const slashingEnabled = this.config.local.slashingEnabled && job.slashingPolicy?.enabled;
        if (slashingEnabled && !submissionAgents.has(bid.agentId)) {
          slashAmount = Math.min(calculateSlashAmount(job, this.config, stakeAmount), stakeAmount);
          reason = 'timeout';
        }

        if (slashAmount > 0) {
          slashes.push({ agentId: bid.agentId, amount: slashAmount, reason });
          if (stakeAmount > 0) {
            state.ledger.push({
              id: newId('ledger'),
              at: now,
              type: 'UNSTAKE',
              agentId: bid.agentId,
              amount: stakeAmount,
              jobId
            });
          }
        } else if (stakeAmount > 0) {
          state.ledger.push({
            id: newId('ledger'),
            at: now,
            type: 'UNSTAKE',
            agentId: bid.agentId,
            amount: stakeAmount,
            jobId
          });
        }
      }

      for (const payout of payouts) {
        state.ledger.push({
          id: newId('ledger'),
          at: now,
          type: 'PAYOUT',
          agentId: payout.agentId,
          amount: payout.amount,
          jobId
        });
      }

      for (const slash of slashes) {
        state.ledger.push({
          id: newId('ledger'),
          at: now,
          type: 'SLASH',
          agentId: slash.agentId,
          amount: -Math.abs(slash.amount),
          jobId,
          reason: slash.reason
        });
      }

      const resolution: Resolution = {
        jobId,
        resolvedAt: now,
        winners: consensus.winners,
        winningSubmissionIds: consensus.winningSubmissionIds,
        payouts,
        slashes,
        consensusTrace: consensus.consensusTrace,
        finalArtifact: consensus.finalArtifact,
        auditLog: [`resolved_by:${agentId}`]
      };

      state.resolutions.push(resolution);
      job.status = 'RESOLVED';
      state.audit.push({
        id: newId('audit'),
        at: now,
        type: 'job_resolved',
        jobId,
        actorAgentId: agentId,
        details: { winners: consensus.winners }
      });

      return resolution;
    })).result;
  }

  async recordError(message: string, context?: Record<string, unknown>): Promise<void> {
    await this.storage.update((state) => {
      state.errors.push({ id: newId('err'), at: nowIso(), message, context });
      if (state.errors.length > 50) state.errors.shift();
    });
  }

  private applyExpiry(state: { jobs: Job[] }): boolean {
    let changed = false;
    for (const job of state.jobs) {
      if ((job.status === 'OPEN' || job.status === 'IN_PROGRESS' || job.status === 'SUBMITTED') && isPast(job.expiresAt)) {
        job.status = 'EXPIRED';
        changed = true;
      }
    }
    return changed;
  }
}
