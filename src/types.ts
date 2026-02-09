export type ConsensusPolicyType =
  | 'SINGLE_WINNER'
  | 'HIGHEST_CONFIDENCE_SINGLE'
  | 'OWNER_PICK'
  | 'TOP_K_SPLIT'
  | 'MAJORITY_VOTE'
  | 'WEIGHTED_VOTE_SIMPLE'
  | 'WEIGHTED_REPUTATION'
  | 'TRUSTED_ARBITER';
export type JobMode = 'SUBMISSION' | 'VOTING';
export type JobStatus =
  | 'OPEN'
  | 'CLOSED'
  | 'RESOLVED'
  | 'CANCELLED'
  | 'CLAIMED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'EXPIRED';
export type ClaimStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';
export type SubmissionStatus = 'VALID' | 'WITHDRAWN' | 'SELECTED' | 'REJECTED' | 'SUBMITTED' | 'ACCEPTED';
export type VoteTargetType = 'SUBMISSION' | 'CHOICE';

export interface ConsensusPolicyConfig {
  type: ConsensusPolicyType;
  trustedArbiterAgentId?: string;
  minConfidence?: number;
  topK?: number;
  ordering?: 'confidence' | 'score';
  quorum?: number;
}

export interface SlashingPolicy {
  enabled: boolean;
  slashPercent: number;
  slashFlat: number;
}

export interface JobConstraints {
  timeSeconds?: number;
  budget?: number;
}

export interface EscrowPolicy {
  type: 'mint' | 'pool';
  poolAccountId?: string;
}

export interface Job {
  id: string;
  boardId?: string;
  creatorPrincipalId?: string;
  title: string;
  desc?: string;
  description: string;
  inputRef?: string;
  createdAt: string;
  expiresAt: string;
  opensAt?: string;
  closesAt?: string;
  resolvesAt?: string;
  createdByAgentId: string;
  mode?: JobMode;
  policyKey?: string;
  policyConfigJson?: Record<string, unknown>;
  tags: string[];
  priority: number;
  requiredCapabilities: string[];
  inputs: Record<string, unknown>;
  constraints: JobConstraints;
  reward: number;
  rewardAmount?: number;
  stakeRequired: number;
  stakeAmount?: number;
  currency?: string;
  maxParticipants: number;
  minParticipants: number;
  consensusPolicy: ConsensusPolicyConfig;
  slashingPolicy: SlashingPolicy;
  escrowPolicy: EscrowPolicy;
  artifactSchemaJson?: Record<string, unknown>;
  status: JobStatus;
}

export interface Bid {
  agentId: string;
  jobId: string;
  stakeAmount: number;
  stakeAt: string;
  eligibilityProof?: string;
  reputationSnapshot?: number;
}

export interface Assignment {
  agentId: string;
  jobId: string;
  claimAt: string;
  leaseUntil: string;
  heartbeatAt: string;
  status: ClaimStatus;
}

export interface Submission {
  id: string;
  jobId: string;
  boardId?: string;
  submitterPrincipalId?: string;
  agentId: string;
  submittedAt: string;
  createdAt?: string;
  artifactRef?: string;
  artifacts: Record<string, unknown>;
  summary: string;
  confidence: number;
  requestedPayout: number;
  evidenceLinks?: string[];
  status: SubmissionStatus;
}

export interface Vote {
  id: string;
  jobId: string;
  boardId?: string;
  voterPrincipalId?: string;
  submissionId?: string;
  targetType?: VoteTargetType;
  targetId?: string;
  choiceKey?: string;
  agentId: string;
  score: number;
  weight?: number;
  stakeAmount?: number;
  rationale?: string;
  createdAt: string;
}

export interface Resolution {
  jobId: string;
  resolvedAt: string;
  winners: string[];
  winningSubmissionIds: string[];
  payouts: Array<{ agentId: string; amount: number }>;
  slashes: Array<{ agentId: string; amount: number; reason: string }>;
  consensusTrace: Record<string, unknown>;
  finalArtifact: Record<string, unknown> | null;
  auditLog: string[];
}

export interface AuditEvent {
  id: string;
  at: string;
  type: string;
  jobId?: string;
  actorAgentId?: string;
  details?: Record<string, unknown>;
}

export interface DiagnosticEntry {
  id: string;
  at: string;
  message: string;
  context?: Record<string, unknown>;
}

export type LedgerEntryType = 'FAUCET' | 'STAKE' | 'UNSTAKE' | 'PAYOUT' | 'SLASH' | 'ADJUST' | 'ESCROW_MINT';

export interface LedgerEntry {
  id: string;
  at: string;
  type: LedgerEntryType;
  agentId: string;
  amount: number;
  jobId?: string;
  reason?: string;
}

export interface StorageState {
  jobs: Job[];
  bids: Bid[];
  claims: Assignment[];
  submissions: Submission[];
  votes: Vote[];
  resolutions: Resolution[];
  ledger: LedgerEntry[];
  audit: AuditEvent[];
  errors: DiagnosticEntry[];
}

export interface ConsensusToolsConfig {
  mode: 'local' | 'global';
  local: {
    storage: {
      kind: 'sqlite' | 'json';
      path: string;
    };
    server: {
      enabled: boolean;
      host: string;
      port: number;
      authToken: string;
    };
    slashingEnabled: boolean;
    jobDefaults: {
      reward: number;
      stakeRequired: number;
      maxParticipants: number;
      minParticipants: number;
      expiresSeconds: number;
      consensusPolicy: ConsensusPolicyConfig;
      slashingPolicy: SlashingPolicy;
    };
    consensusPolicies?: Record<string, ConsensusPolicyConfig>;
    ledger: {
      faucetEnabled: boolean;
      initialCreditsPerAgent: number;
      balances: Record<string, number>;
      balancesMode?: 'initial' | 'override';
    };
  };
  global: {
    baseUrl: string;
    accessToken: string;
  };
  agentIdentity: {
    agentIdSource: 'openclaw' | 'env' | 'manual';
    manualAgentId: string;
  };
  safety: {
    requireOptionalToolsOptIn: boolean;
    allowNetworkSideEffects: boolean;
  };
}
