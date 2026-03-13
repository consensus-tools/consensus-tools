import { vi } from "vitest";
import type { McpContext } from "../src/context.js";

export function makeMockCtx(overrides: Partial<McpContext> = {}): McpContext {
  return {
    engine: {
      postJob: vi.fn().mockResolvedValue({ id: "job-1", title: "Test Job" }),
      listJobs: vi.fn().mockResolvedValue([]),
      submitJob: vi.fn().mockResolvedValue({ id: "sub-1" }),
      vote: vi.fn().mockResolvedValue({ id: "vote-1" }),
      getStatus: vi.fn().mockResolvedValue({ job: null }),
    } as any,
    agentRegistry: {
      createAgent: vi.fn().mockResolvedValue({ id: "agent-1", name: "Test", status: "active" }),
      listAgents: vi.fn().mockResolvedValue([]),
      suspendAgent: vi.fn().mockResolvedValue(null),
      activateAgent: vi.fn().mockResolvedValue(null),
    } as any,
    guardEngine: {
      evaluate: vi.fn().mockResolvedValue({
        decision: "ALLOW",
        reason: "Safe",
        risk_score: 0.1,
        audit_id: "audit-1",
        votes: [],
        guard_type: "agent_action",
      }),
    } as any,
    hitlTracker: {
      recordVoteReceived: vi.fn().mockResolvedValue({ complete: false, total: 1, required: 2 }),
      resolveApproval: vi.fn().mockResolvedValue(undefined),
    } as any,
    storage: (() => {
      const stateData: Record<string, unknown[]> = {
        jobs: [], bids: [], claims: [], submissions: [], votes: [],
        resolutions: [], ledger: [], audit: [], errors: [], agents: [],
        participants: [], workflows: [], workflowRuns: [], cronSchedules: [],
        hitlApprovals: [], guardResults: [], policyAssignments: [],
        consensusVotes: [],
      };
      return {
        getState: vi.fn().mockImplementation(async () => ({ ...stateData })),
        update: vi.fn().mockImplementation(async (fn: (state: any) => void) => {
          fn(stateData);
          return { state: stateData, result: undefined };
        }),
        init: vi.fn(),
      };
    })() as any,
    agentId: "test-agent",
    ...overrides,
  };
}

export function parseContent(result: { content: Array<{ type: string; text: string }> }): any {
  try {
    return JSON.parse(result.content[0].text);
  } catch {
    return result.content[0].text;
  }
}

export function getErrorText(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text;
}
