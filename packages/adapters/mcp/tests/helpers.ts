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
    storage: {
      getState: vi.fn().mockResolvedValue({
        jobs: [],
        bids: [],
        claims: [],
        submissions: [],
        votes: [],
        resolutions: [],
        ledger: [],
        audit: [],
        errors: [],
        agents: [],
        participants: [],
        workflows: [],
        workflowRuns: [],
        cronSchedules: [],
        hitlApprovals: [],
        guardResults: [],
      }),
      update: vi.fn(),
      init: vi.fn(),
    } as any,
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
