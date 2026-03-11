import type { Job, Submission, Vote, ConsensusInput, ConsensusPolicyType } from "@consensus-tools/schemas";

let counter = 0;
function uid(prefix = "id") { return `${prefix}-${++counter}`; }

export function makeJob(overrides: Partial<Job> & { consensusPolicy?: Partial<Job["consensusPolicy"]> } = {}): Job {
  const { consensusPolicy, ...rest } = overrides;
  return {
    id: uid("job"),
    title: "Test Job",
    description: "test",
    createdAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-01-02T00:00:00Z",
    createdByAgentId: "owner",
    tags: [],
    priority: 0,
    requiredCapabilities: [],
    inputs: {},
    constraints: {},
    reward: 10,
    stakeRequired: 0,
    maxParticipants: 10,
    minParticipants: 1,
    consensusPolicy: {
      type: "FIRST_SUBMISSION_WINS" as ConsensusPolicyType,
      ...consensusPolicy,
    },
    slashingPolicy: { enabled: false, slashPercent: 0, slashFlat: 0 },
    escrowPolicy: { type: "mint" },
    status: "OPEN",
    ...rest,
  } as Job;
}

export function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  const id = overrides.id ?? uid("sub");
  return {
    id,
    jobId: "job-1",
    agentId: uid("agent"),
    submittedAt: new Date().toISOString(),
    artifacts: { result: true },
    summary: "submission",
    confidence: 0.8,
    requestedPayout: 0,
    status: "VALID",
    ...overrides,
  } as Submission;
}

export function makeVote(overrides: Partial<Vote> = {}): Vote {
  return {
    id: uid("vote"),
    jobId: "job-1",
    agentId: uid("voter"),
    score: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Vote;
}

export function makeInput(overrides: Partial<ConsensusInput> = {}): ConsensusInput {
  return {
    job: makeJob(),
    submissions: [],
    votes: [],
    reputation: () => 100,
    ...overrides,
  };
}
